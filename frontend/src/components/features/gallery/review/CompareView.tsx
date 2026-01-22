/**
 * CompareView Component
 * Side-by-side comparison view for 2 images in Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T051
 *
 * Features:
 * - 2-up layout showing two images simultaneously
 * - Active image indicator for receiving rating/flag changes
 * - Keyboard focus switching (Tab or [ / ])
 * - Synchronized zoom and pan (optional)
 * - Metadata display for both images
 */

import React, { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Focus, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  FilteredAsset,
  AssetRating,
  AssetFlag,
  ColorLabel,
} from '../../../../types/reviewMode';
import { RatingStars } from './RatingStars';
import { FlagIndicator } from './FlagIndicator';
import { ColorLabelIndicator } from './ColorLabelIndicator';

export interface CompareViewProps {
  /** Left image (primary) */
  leftAsset: FilteredAsset | null;
  /** Right image (secondary) */
  rightAsset: FilteredAsset | null;
  /** Index of left image */
  leftIndex: number;
  /** Index of right image */
  rightIndex: number;
  /** Total number of assets */
  totalAssets: number;
  /** Which side is active for receiving changes */
  activePane: 'left' | 'right';
  /** Callback when active pane changes */
  onActivePaneChange: (pane: 'left' | 'right') => void;
  /** Callback to change left image */
  onLeftChange: (index: number) => void;
  /** Callback to change right image */
  onRightChange: (index: number) => void;
  /** Rating change callback */
  onRatingChange: (rating: AssetRating) => void;
  /** Flag change callback */
  onFlagChange: (flag: AssetFlag) => void;
  /** Color label change callback */
  onColorLabelChange: (label: ColorLabel) => void;
  /** Whether sync zoom is enabled */
  syncZoom?: boolean;
  /** Toggle sync zoom */
  onSyncZoomToggle?: () => void;
  /** Loading state */
  isUpdating?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * CompareImagePane - Single image pane in compare view
 */
const CompareImagePane: React.FC<{
  asset: FilteredAsset | null;
  index: number;
  totalAssets: number;
  isActive: boolean;
  position: 'left' | 'right';
  onActivate: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onRatingChange: (rating: AssetRating) => void;
  onFlagChange: (flag: AssetFlag) => void;
  onColorLabelChange: (label: ColorLabel) => void;
  isUpdating?: boolean;
}> = ({
  asset,
  index,
  totalAssets,
  isActive,
  position,
  onActivate,
  onNavigate,
  onRatingChange,
  onFlagChange,
  onColorLabelChange,
  isUpdating = false,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const hasPrev = index > 0;
  const hasNext = index < totalAssets - 1;

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z * 1.5, 5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z / 1.5, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  if (!asset) {
    return (
      <div
        className={`
          flex-1 flex items-center justify-center
          bg-black/90 border-2
          ${isActive ? 'border-primary' : 'border-transparent'}
          transition-colors
        `}
        onClick={onActivate}
      >
        <div className="text-center text-text-tertiary">
          <p className="text-lg">No image selected</p>
          <p className="text-sm">Use navigation to select an image</p>
        </div>
      </div>
    );
  }

  // Build thumbnail URL
  const thumbnailUrl = asset.thumbnail_url || `/api/v1/assets/${asset.asset_id}/thumbnail?size=large`;

  return (
    <div
      className={`
        flex-1 flex flex-col relative
        bg-black/90 border-2
        ${isActive ? 'border-primary shadow-lg shadow-primary/20' : 'border-transparent'}
        transition-all duration-200
      `}
      onClick={onActivate}
      role="region"
      aria-label={`${position} comparison image`}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-primary rounded-md text-xs font-medium text-white flex items-center gap-1">
          <Focus size={12} />
          Active
        </div>
      )}

      {/* Image position indicator */}
      <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-black/70 rounded-md text-xs text-white">
        {index + 1} / {totalAssets}
      </div>

      {/* Navigation buttons */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate('prev');
        }}
        disabled={!hasPrev}
        className={`
          absolute left-2 top-1/2 -translate-y-1/2 z-10
          p-2 rounded-full bg-black/60 text-white
          disabled:opacity-30 disabled:cursor-not-allowed
          hover:bg-black/80 transition-colors
        `}
        aria-label="Previous image"
      >
        <ChevronLeft size={20} />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate('next');
        }}
        disabled={!hasNext}
        className={`
          absolute right-2 top-1/2 -translate-y-1/2 z-10
          p-2 rounded-full bg-black/60 text-white
          disabled:opacity-30 disabled:cursor-not-allowed
          hover:bg-black/80 transition-colors
        `}
        aria-label="Next image"
      >
        <ChevronRight size={20} />
      </button>

      {/* Main image area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        <div
          className="relative max-w-full max-h-full"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'center',
            transition: 'transform 0.2s ease-out',
          }}
        >
          <img
            src={thumbnailUrl}
            alt={asset.filename}
            className="max-w-full max-h-full object-contain rounded"
            draggable={false}
          />
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface/95 border-t border-border">
        {/* Metadata */}
        <div className="flex items-center gap-3">
          <RatingStars
            rating={asset.rating ?? null}
            onChange={isActive ? onRatingChange : undefined}
            size="md"
          />
          <FlagIndicator
            flag={asset.flag ?? 'unflagged'}
            onChange={isActive ? onFlagChange : undefined}
            size="md"
          />
          <ColorLabelIndicator
            colorLabel={asset.color_label ?? 'none'}
            onChange={isActive ? onColorLabelChange : undefined}
            size="md"
          />
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleZoomOut();
            }}
            className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleResetZoom();
            }}
            className="px-2 py-1 text-xs text-text-tertiary hover:text-text-primary"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleZoomIn();
            }}
            className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* Filename */}
      <div className="px-4 py-2 bg-surface-secondary text-xs text-text-secondary truncate">
        {asset.filename}
      </div>

      {/* Updating overlay */}
      {isUpdating && isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

/**
 * CompareView - 2-up image comparison layout
 */
export const CompareView: React.FC<CompareViewProps> = ({
  leftAsset,
  rightAsset,
  leftIndex,
  rightIndex,
  totalAssets,
  activePane,
  onActivePaneChange,
  onLeftChange,
  onRightChange,
  onRatingChange,
  onFlagChange,
  onColorLabelChange,
  syncZoom = false,
  onSyncZoomToggle,
  isUpdating = false,
  className = '',
}) => {
  // Handle pane navigation
  const handleLeftNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      const newIndex = direction === 'prev' ? leftIndex - 1 : leftIndex + 1;
      if (newIndex >= 0 && newIndex < totalAssets) {
        onLeftChange(newIndex);
      }
    },
    [leftIndex, totalAssets, onLeftChange]
  );

  const handleRightNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      const newIndex = direction === 'prev' ? rightIndex - 1 : rightIndex + 1;
      if (newIndex >= 0 && newIndex < totalAssets) {
        onRightChange(newIndex);
      }
    },
    [rightIndex, totalAssets, onRightChange]
  );

  // Get the active asset for metadata changes
  const activeAsset = activePane === 'left' ? leftAsset : rightAsset;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Compare header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span>Compare Mode</span>
          <span className="text-text-tertiary">|</span>
          <span className="text-text-tertiary">
            Press <kbd className="px-1 py-0.5 bg-surface-hover rounded text-xs">Tab</kbd> or{' '}
            <kbd className="px-1 py-0.5 bg-surface-hover rounded text-xs">[</kbd>{' '}
            <kbd className="px-1 py-0.5 bg-surface-hover rounded text-xs">]</kbd> to switch focus
          </span>
        </div>

        {/* Sync zoom toggle */}
        {onSyncZoomToggle && (
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={syncZoom}
              onChange={onSyncZoomToggle}
              className="rounded border-border text-primary focus:ring-primary"
            />
            Sync zoom
          </label>
        )}
      </div>

      {/* Compare panes */}
      <div className="flex-1 flex gap-1 p-1 bg-black">
        <CompareImagePane
          asset={leftAsset}
          index={leftIndex}
          totalAssets={totalAssets}
          isActive={activePane === 'left'}
          position="left"
          onActivate={() => onActivePaneChange('left')}
          onNavigate={handleLeftNavigate}
          onRatingChange={onRatingChange}
          onFlagChange={onFlagChange}
          onColorLabelChange={onColorLabelChange}
          isUpdating={isUpdating && activePane === 'left'}
        />

        <CompareImagePane
          asset={rightAsset}
          index={rightIndex}
          totalAssets={totalAssets}
          isActive={activePane === 'right'}
          position="right"
          onActivate={() => onActivePaneChange('right')}
          onNavigate={handleRightNavigate}
          onRatingChange={onRatingChange}
          onFlagChange={onFlagChange}
          onColorLabelChange={onColorLabelChange}
          isUpdating={isUpdating && activePane === 'right'}
        />
      </div>
    </div>
  );
};

export default CompareView;
