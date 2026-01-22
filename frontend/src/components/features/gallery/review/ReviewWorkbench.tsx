/**
 * ReviewWorkbench Component
 * Main 3-pane layout for Pro Review Mode (Lightroom-style interface)
 * Feature: 029-pro-review-xmp-sync
 * Task: T029
 *
 * Layout:
 * - Left: Vertical filmstrip (optional)
 * - Center: Main canvas with image and controls
 * - Right: Metadata panel
 * - Bottom: Horizontal filmstrip
 *
 * Features:
 * - Keyboard shortcut integration
 * - Filter bar for quick filtering
 * - Compare mode support
 * - Responsive layout
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Filter,
  Grid,
  Columns,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Info,
  Maximize2,
  GitCompare,
} from 'lucide-react';
import type {
  FilteredAsset,
  AssetRating,
  AssetFlag,
  ColorLabel,
  ReviewFilterOptions,
  ReviewStats,
} from '../../../../types/reviewMode';
import { useKeyboardShortcuts } from '../../../../hooks/useKeyboardShortcuts';
import type { ComparePane, CompareState } from '../../../../hooks/useReviewMode';
import { ReviewCanvas } from './ReviewCanvas';
import { ReviewFilmstrip } from './ReviewFilmstrip';
import { ReviewMetadataPanel } from './ReviewMetadataPanel';
import { KeyboardShortcutHelp } from './KeyboardShortcutHelp';
import { CompareView } from './CompareView';
import { RatingStars } from './RatingStars';
import { FlagIndicator, FlagBadge } from './FlagIndicator';
import { ColorLabelIndicator } from './ColorLabelIndicator';

export interface ReviewWorkbenchProps {
  /** All assets to review */
  assets: FilteredAsset[];
  /** Current selected index */
  currentIndex: number;
  /** Current asset */
  currentAsset: FilteredAsset | null;
  /** Gallery title for header */
  galleryTitle?: string;
  /** Review statistics */
  stats?: ReviewStats;
  /** Current filters */
  filters: ReviewFilterOptions;
  /** Loading state */
  isLoading?: boolean;
  /** Updating metadata state */
  isUpdating?: boolean;
  /** Syncing state */
  isSyncing?: boolean;
  /** Auto-advance after rating */
  autoAdvance?: boolean;
  /** Compare mode state */
  compare?: CompareState;
  /** Callbacks */
  onNavigate: (direction: 'prev' | 'next' | 'first' | 'last' | number) => void;
  onRatingChange: (rating: AssetRating) => void;
  onFlagChange: (flag: AssetFlag) => void;
  onColorLabelChange: (label: ColorLabel) => void;
  onFilterChange: (filters: ReviewFilterOptions) => void;
  onAutoAdvanceToggle?: (enabled: boolean) => void;
  /** Compare mode callbacks */
  onEnterCompare?: () => void;
  onExitCompare?: () => void;
  onActivePaneChange?: (pane: ComparePane) => void;
  onToggleActivePane?: () => void;
  onLeftIndexChange?: (index: number) => void;
  onRightIndexChange?: (index: number) => void;
  onSyncZoomToggle?: () => void;
  onCompareRatingChange?: (rating: AssetRating) => void;
  onCompareFlagChange?: (flag: AssetFlag) => void;
  onCompareColorLabelChange?: (label: ColorLabel) => void;
  onExit: () => void;
  /** Custom className */
  className?: string;
}

type LayoutMode = 'standard' | 'filmstrip-left' | 'minimal';

/**
 * FilterBar - Quick filter controls
 */
const FilterBar: React.FC<{
  filters: ReviewFilterOptions;
  stats?: ReviewStats;
  onChange: (filters: ReviewFilterOptions) => void;
}> = ({ filters, stats, onChange }) => {
  const handleRatingFilter = (rating: AssetRating | null) => {
    onChange({
      ...filters,
      minRating: rating !== null ? rating : undefined,
    });
  };

  const handleFlagFilter = (flag: AssetFlag | null) => {
    if (flag === null) {
      onChange({ ...filters, flags: undefined });
    } else if (filters.flags?.includes(flag)) {
      const newFlags = filters.flags.filter((f) => f !== flag);
      onChange({ ...filters, flags: newFlags.length > 0 ? newFlags : undefined });
    } else {
      onChange({ ...filters, flags: [...(filters.flags || []), flag] });
    }
  };

  const handleColorFilter = (color: ColorLabel | null) => {
    if (color === null || color === 'none') {
      onChange({ ...filters, colorLabels: undefined });
    } else if (filters.colorLabels?.includes(color)) {
      const newColors = filters.colorLabels.filter((c) => c !== color);
      onChange({ ...filters, colorLabels: newColors.length > 0 ? newColors : undefined });
    } else {
      onChange({ ...filters, colorLabels: [...(filters.colorLabels || []), color] });
    }
  };

  const clearFilters = () => {
    onChange({});
  };

  const hasFilters =
    filters.minRating !== undefined ||
    (filters.flags && filters.flags.length > 0) ||
    (filters.colorLabels && filters.colorLabels.length > 0);

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-surface-hover/50 border-b border-border">
      <Filter size={16} className="text-text-tertiary" />

      {/* Rating filter */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-text-tertiary mr-1">Min:</span>
        <RatingStars
          rating={filters.minRating ?? null}
          onChange={(r) => handleRatingFilter(r === 0 ? null : r)}
          size="sm"
        />
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Flag filter */}
      <div className="flex items-center gap-1">
        {(['pick', 'unflagged', 'reject'] as AssetFlag[]).map((flag) => (
          <button
            key={flag}
            onClick={() => handleFlagFilter(flag)}
            className={`
              p-1 rounded
              ${filters.flags?.includes(flag)
                ? 'bg-primary/20 text-primary'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
              }
              transition-colors
            `}
            aria-label={`Filter by ${flag}`}
            aria-pressed={filters.flags?.includes(flag)}
          >
            <FlagBadge flag={flag} className="w-4 h-4" />
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Color filter */}
      <ColorLabelIndicator
        colorLabel={filters.colorLabels?.[0] || 'none'}
        onChange={(label) => handleColorFilter(label)}
        size="sm"
        variant="selector"
      />

      {/* Clear filters */}
      {hasFilters && (
        <>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={clearFilters}
            className="text-xs text-primary hover:text-primary-hover transition-colors"
          >
            Clear filters
          </button>
        </>
      )}

      {/* Stats */}
      {stats && (
        <div className="ml-auto flex items-center gap-3 text-xs text-text-tertiary">
          <span>{stats.total} total</span>
          {stats.byFlag.pick > 0 && <span className="text-primary">{stats.byFlag.pick} picks</span>}
          {stats.byFlag.reject > 0 && (
            <span className="text-red-500">{stats.byFlag.reject} rejected</span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * ReviewWorkbench - Main 3-pane Review Mode layout
 */
export const ReviewWorkbench: React.FC<ReviewWorkbenchProps> = ({
  assets,
  currentIndex,
  currentAsset,
  galleryTitle,
  stats,
  filters,
  isLoading = false,
  isUpdating = false,
  isSyncing = false,
  autoAdvance = true,
  compare,
  onNavigate,
  onRatingChange,
  onFlagChange,
  onColorLabelChange,
  onFilterChange,
  onAutoAdvanceToggle,
  onEnterCompare,
  onExitCompare,
  onActivePaneChange,
  onToggleActivePane,
  onLeftIndexChange,
  onRightIndexChange,
  onSyncZoomToggle,
  onCompareRatingChange,
  onCompareFlagChange,
  onCompareColorLabelChange,
  onExit,
  className = '',
}) => {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('standard');
  const [showMetadataPanel, setShowMetadataPanel] = useState(true);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Derived compare mode state
  const isCompareActive = compare?.isActive ?? false;

  // Navigation helpers
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < assets.length - 1;

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next' | 'first' | 'last') => {
      onNavigate(direction);
    },
    [onNavigate]
  );

  const handleSelect = useCallback(
    (index: number) => {
      onNavigate(index);
    },
    [onNavigate]
  );

  // Compare mode toggle handler
  const handleCompareToggle = useCallback(() => {
    if (isCompareActive) {
      onExitCompare?.();
    } else {
      onEnterCompare?.();
    }
  }, [isCompareActive, onEnterCompare, onExitCompare]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    enabled: !showShortcutHelp,
    // In compare mode, route rating/flag/label to compare handlers
    onRating: isCompareActive && onCompareRatingChange ? onCompareRatingChange : onRatingChange,
    onFlag: isCompareActive && onCompareFlagChange ? onCompareFlagChange : onFlagChange,
    onColorLabel: isCompareActive && onCompareColorLabelChange ? onCompareColorLabelChange : onColorLabelChange,
    onNavigate: handleNavigate,
    onHelp: () => setShowShortcutHelp(true),
    onZoom: () => {
      // Zoom is handled by ReviewCanvas
    },
    onCompare: handleCompareToggle,
    onEscape: () => {
      if (showShortcutHelp) {
        setShowShortcutHelp(false);
      } else if (isCompareActive) {
        onExitCompare?.();
      } else if (isFullscreen) {
        setIsFullscreen(false);
      } else {
        onExit();
      }
    },
    autoAdvance,
  });

  // Additional keyboard shortcuts for compare mode focus switching
  useEffect(() => {
    if (!isCompareActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab, [ or ] to switch active pane
      if (e.key === 'Tab' || e.key === '[' || e.key === ']') {
        e.preventDefault();
        onToggleActivePane?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCompareActive, onToggleActivePane]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  // Layout toggle
  const cycleLayout = useCallback(() => {
    setLayoutMode((prev) => {
      if (prev === 'standard') return 'filmstrip-left';
      if (prev === 'filmstrip-left') return 'minimal';
      return 'standard';
    });
  }, []);

  return (
    <div
      className={`
        flex flex-col h-full
        bg-black text-white
        ${className}
      `}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-surface/95 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="
              p-1.5 rounded-lg
              text-text-tertiary hover:text-text-primary
              hover:bg-surface-hover
              transition-colors
            "
            aria-label="Exit review mode"
          >
            <X size={20} />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">
              {galleryTitle || 'Review Mode'}
            </h1>
            <p className="text-xs text-text-tertiary">
              {currentIndex + 1} of {assets.length} photos
            </p>
          </div>
        </div>

        {/* Layout controls */}
        <div className="flex items-center gap-2">
          {/* Auto-advance toggle */}
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => onAutoAdvanceToggle?.(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            Auto-advance
          </label>

          <div className="w-px h-5 bg-border mx-2" />

          {/* Compare mode toggle */}
          {onEnterCompare && assets.length >= 2 && (
            <button
              onClick={handleCompareToggle}
              className={`
                p-1.5 rounded-lg
                transition-colors
                ${isCompareActive
                  ? 'bg-primary/20 text-primary'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                }
              `}
              aria-label={isCompareActive ? 'Exit compare mode' : 'Enter compare mode'}
              aria-pressed={isCompareActive}
              title={isCompareActive ? 'Exit compare (C)' : 'Compare 2 images (C)'}
            >
              <GitCompare size={18} />
            </button>
          )}

          {/* Layout toggle */}
          <button
            onClick={cycleLayout}
            className="
              p-1.5 rounded-lg
              text-text-tertiary hover:text-text-primary
              hover:bg-surface-hover
              transition-colors
            "
            aria-label="Toggle layout"
            title="Toggle layout"
            disabled={isCompareActive}
          >
            {layoutMode === 'standard' ? (
              <Grid size={18} />
            ) : layoutMode === 'filmstrip-left' ? (
              <Columns size={18} />
            ) : (
              <SlidersHorizontal size={18} />
            )}
          </button>

          {/* Metadata panel toggle */}
          <button
            onClick={() => setShowMetadataPanel(!showMetadataPanel)}
            className={`
              p-1.5 rounded-lg
              transition-colors
              ${showMetadataPanel
                ? 'bg-primary/20 text-primary'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
              }
            `}
            aria-label="Toggle metadata panel"
            aria-pressed={showMetadataPanel}
          >
            <Info size={18} />
          </button>

          {/* Filmstrip toggle */}
          <button
            onClick={() => setShowFilmstrip(!showFilmstrip)}
            className={`
              p-1.5 rounded-lg
              transition-colors
              ${showFilmstrip
                ? 'bg-primary/20 text-primary'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
              }
            `}
            aria-label="Toggle filmstrip"
            aria-pressed={showFilmstrip}
          >
            <ChevronLeft size={18} className="rotate-90" />
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <FilterBar filters={filters} stats={stats} onChange={onFilterChange} />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Compare Mode View */}
        {isCompareActive && compare && onLeftIndexChange && onRightIndexChange && onActivePaneChange ? (
          <CompareView
            leftAsset={assets[compare.leftIndex] || null}
            rightAsset={assets[compare.rightIndex] || null}
            leftIndex={compare.leftIndex}
            rightIndex={compare.rightIndex}
            totalAssets={assets.length}
            activePane={compare.activePane}
            onActivePaneChange={onActivePaneChange}
            onLeftChange={onLeftIndexChange}
            onRightChange={onRightIndexChange}
            onRatingChange={onCompareRatingChange || onRatingChange}
            onFlagChange={onCompareFlagChange || onFlagChange}
            onColorLabelChange={onCompareColorLabelChange || onColorLabelChange}
            syncZoom={compare.syncZoom}
            onSyncZoomToggle={onSyncZoomToggle}
            isUpdating={isUpdating}
            className="flex-1"
          />
        ) : (
          <>
            {/* Left filmstrip (filmstrip-left layout) */}
            {layoutMode === 'filmstrip-left' && showFilmstrip && (
              <ReviewFilmstrip
                assets={assets}
                currentIndex={currentIndex}
                onSelect={handleSelect}
                orientation="vertical"
                thumbnailWidth={80}
                thumbnailHeight={60}
                visible={true}
              />
            )}

            {/* Center: Canvas */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <ReviewCanvas
                asset={currentAsset}
                currentIndex={currentIndex}
                totalAssets={assets.length}
                hasPrev={hasPrev}
                hasNext={hasNext}
                onPrev={() => handleNavigate('prev')}
                onNext={() => handleNavigate('next')}
                onRatingChange={onRatingChange}
                onFlagChange={onFlagChange}
                onColorLabelChange={onColorLabelChange}
                showControls={layoutMode !== 'minimal'}
                showMetadata={layoutMode !== 'minimal'}
                isUpdating={isUpdating}
                className="flex-1"
              />

              {/* Bottom filmstrip (standard layout) */}
              {layoutMode === 'standard' && showFilmstrip && (
                <ReviewFilmstrip
                  assets={assets}
                  currentIndex={currentIndex}
                  onSelect={handleSelect}
                  orientation="horizontal"
                  thumbnailWidth={80}
                  thumbnailHeight={60}
                  visible={true}
                />
              )}
            </div>
          </>
        )}

        {/* Right: Metadata panel */}
        {showMetadataPanel && !isCompareActive && (
          <ReviewMetadataPanel
            asset={currentAsset}
            onRatingChange={onRatingChange}
            onFlagChange={onFlagChange}
            onColorLabelChange={onColorLabelChange}
            isSyncing={isSyncing}
            showShortcuts={true}
          />
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-white/70 text-sm">Loading...</span>
          </div>
        </div>
      )}

      {/* Keyboard shortcut help modal */}
      <KeyboardShortcutHelp isOpen={showShortcutHelp} onClose={() => setShowShortcutHelp(false)} />
    </div>
  );
};

export default ReviewWorkbench;
