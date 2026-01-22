/**
 * ReviewCanvas Component
 * Main image display area for Pro Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T026
 *
 * Features:
 * - Full-size image display with loading states
 * - Rating/flag/color_label overlays
 * - Zoom controls
 * - Previous/next navigation
 * - Keyboard shortcut feedback
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Loader2 } from 'lucide-react';
import type { FilteredAsset, AssetRating, AssetFlag, ColorLabel } from '../../../../types/reviewMode';
import { RatingStars, RatingBadge } from './RatingStars';
import { FlagIndicator, FlagBadge } from './FlagIndicator';
import { ColorLabelBadge } from './ColorLabelIndicator';

export interface ReviewCanvasProps {
  /** Current asset to display */
  asset: FilteredAsset | null;
  /** Current index in the gallery */
  currentIndex: number;
  /** Total number of assets */
  totalAssets: number;
  /** Whether there's a previous asset */
  hasPrev: boolean;
  /** Whether there's a next asset */
  hasNext: boolean;
  /** Callback when navigating to previous */
  onPrev: () => void;
  /** Callback when navigating to next */
  onNext: () => void;
  /** Callback when rating changes */
  onRatingChange?: (rating: AssetRating) => void;
  /** Callback when flag changes */
  onFlagChange?: (flag: AssetFlag) => void;
  /** Callback when color label changes */
  onColorLabelChange?: (label: ColorLabel) => void;
  /** Show overlay controls */
  showControls?: boolean;
  /** Show metadata overlays */
  showMetadata?: boolean;
  /** Whether currently updating */
  isUpdating?: boolean;
  /** Custom className */
  className?: string;
}

type ZoomLevel = 'fit' | '100' | '200';

/**
 * ReviewCanvas - Main image display for Review Mode
 */
export const ReviewCanvas: React.FC<ReviewCanvasProps> = ({
  asset,
  currentIndex,
  totalAssets,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onRatingChange,
  onFlagChange,
  onColorLabelChange,
  showControls = true,
  showMetadata = true,
  isUpdating = false,
  className = '',
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('fit');
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset loading state when asset changes
  useEffect(() => {
    setIsLoading(true);
    setImageError(false);
  }, [asset?.asset_id]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(true);
  }, []);

  const cycleZoom = useCallback(() => {
    setZoomLevel((prev) => {
      if (prev === 'fit') return '100';
      if (prev === '100') return '200';
      return 'fit';
    });
  }, []);

  // Get image URL (preview for viewing, original for zoom)
  const imageUrl = zoomLevel === 'fit' ? asset?.preview_url : (asset?.preview_url || asset?.thumbnail_url);

  // Calculate zoom transform
  const getZoomStyle = (): React.CSSProperties => {
    switch (zoomLevel) {
      case '100':
        return { transform: 'scale(1)', cursor: 'zoom-in' };
      case '200':
        return { transform: 'scale(2)', cursor: 'zoom-out' };
      default:
        return { transform: 'scale(1)', cursor: 'zoom-in' };
    }
  };

  if (!asset) {
    return (
      <div className={`flex items-center justify-center h-full bg-surface-hover ${className}`}>
        <p className="text-text-tertiary">No asset selected</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`
        relative flex flex-col h-full
        bg-black/95
        ${className}
      `}
    >
      {/* Top bar: metadata and controls */}
      {showMetadata && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 to-transparent">
          {/* Left: Filename and position */}
          <div className="flex items-center gap-3">
            <span className="text-white/90 text-sm font-medium">{asset.filename}</span>
            <span className="text-white/50 text-xs">
              {currentIndex + 1} / {totalAssets}
            </span>
          </div>

          {/* Right: Metadata badges */}
          <div className="flex items-center gap-2">
            {asset.rating !== null && asset.rating > 0 && (
              <RatingBadge rating={asset.rating} />
            )}
            <FlagBadge flag={asset.flag} />
            <ColorLabelBadge colorLabel={asset.color_label} />
          </div>
        </div>
      )}

      {/* Main image area */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden"
        onClick={cycleZoom}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
          </div>
        )}

        {imageError ? (
          <div className="flex flex-col items-center gap-2 text-white/50">
            <span>Failed to load image</span>
            <span className="text-xs">{asset.filename}</span>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={asset.filename}
            className={`
              max-w-full max-h-full object-contain
              transition-transform duration-200
              ${zoomLevel !== 'fit' ? 'cursor-zoom-out' : 'cursor-zoom-in'}
            `}
            style={getZoomStyle()}
            onLoad={handleImageLoad}
            onError={handleImageError}
            draggable={false}
          />
        )}

        {/* Updating overlay */}
        {isUpdating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Navigation arrows */}
      {showControls && (
        <>
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className={`
              absolute left-2 top-1/2 -translate-y-1/2
              w-10 h-10 rounded-full
              flex items-center justify-center
              bg-black/50 hover:bg-black/70
              text-white/70 hover:text-white
              transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed
              focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50
            `}
            aria-label="Previous photo"
          >
            <ChevronLeft size={24} />
          </button>

          <button
            onClick={onNext}
            disabled={!hasNext}
            className={`
              absolute right-2 top-1/2 -translate-y-1/2
              w-10 h-10 rounded-full
              flex items-center justify-center
              bg-black/50 hover:bg-black/70
              text-white/70 hover:text-white
              transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed
              focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50
            `}
            aria-label="Next photo"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* Bottom bar: Quick actions */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center p-3 bg-gradient-to-t from-black/70 to-transparent">
          <div className="flex items-center gap-4 bg-black/50 rounded-lg px-4 py-2 backdrop-blur-sm">
            {/* Rating */}
            <RatingStars
              rating={asset.rating}
              onChange={onRatingChange}
              size="md"
            />

            <div className="w-px h-6 bg-white/20" />

            {/* Flag */}
            <FlagIndicator
              flag={asset.flag}
              onChange={onFlagChange}
              showAllOptions
              size="sm"
            />

            <div className="w-px h-6 bg-white/20" />

            {/* Zoom controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoomLevel('fit')}
                className={`
                  p-1.5 rounded
                  ${zoomLevel === 'fit' ? 'bg-white/20' : 'hover:bg-white/10'}
                  text-white/70 hover:text-white
                  transition-colors
                `}
                aria-label="Fit to screen"
              >
                <Maximize size={16} />
              </button>
              <button
                onClick={() => setZoomLevel(zoomLevel === '100' ? '200' : '100')}
                className={`
                  p-1.5 rounded
                  ${zoomLevel !== 'fit' ? 'bg-white/20' : 'hover:bg-white/10'}
                  text-white/70 hover:text-white
                  transition-colors
                `}
                aria-label="Zoom"
              >
                {zoomLevel === '200' ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
              </button>
              <span className="text-xs text-white/50 min-w-[40px] text-center">
                {zoomLevel === 'fit' ? 'Fit' : `${zoomLevel}%`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewCanvas;
