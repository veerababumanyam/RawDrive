/**
 * LightboxCompare Component
 * Side-by-side photo comparison with synchronized zoom/pan
 * Supports horizontal and vertical layouts
 */

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ArrowLeftRight,
  Link,
  Unlink,
  Columns,
  Rows,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import type { GalleryAssetItem } from '../../../types/gallery';
import { useLightboxCompare, type CompareZoomState } from '../../../hooks/lightbox/useLightboxCompare';

export interface LightboxCompareProps {
  /** All assets in the gallery */
  assets: GalleryAssetItem[];
  /** Primary image index */
  primaryIndex: number;
  /** Secondary image index */
  secondaryIndex: number;
  /** Callback when primary index changes */
  onPrimaryChange: (index: number) => void;
  /** Callback when secondary index changes */
  onSecondaryChange: (index: number) => void;
  /** Callback to exit compare mode */
  onExit: () => void;
  /** Function to get preview URL for an asset */
  getPreviewUrl: (assetId: string) => string | undefined;
  /** Initial layout direction */
  initialLayout?: 'horizontal' | 'vertical';
  /** Initial sync zoom setting */
  initialSyncZoom?: boolean;
  /** Initial sync pan setting */
  initialSyncPan?: boolean;
  /** Custom className */
  className?: string;
}

// Compare image component
const CompareImage: React.FC<{
  asset: GalleryAssetItem;
  src: string | undefined;
  state: CompareZoomState;
  label: string;
  position: 'primary' | 'secondary';
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onWheel: (e: React.WheelEvent) => void;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
  onDragMove: (e: React.MouseEvent | React.TouchEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}> = ({
  asset,
  src,
  state,
  label,
  position,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onWheel,
  onDragStart,
  onDragMove,
  onDragEnd,
  isDragging,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset loaded state when src changes
  React.useEffect(() => {
    setImageLoaded(false);
  }, [src]);

  return (
    <div className="relative flex-1 overflow-hidden bg-black/50">
      {/* Label */}
      <div className="absolute top-2 left-2 z-20 px-2 py-1 bg-black/70 rounded text-white text-xs font-medium">
        {label}
      </div>

      {/* Image filename */}
      <div className="absolute top-2 right-2 z-20 px-2 py-1 bg-black/70 rounded text-white text-xs max-w-[150px] truncate">
        {asset.asset.filename || `Photo`}
      </div>

      {/* Navigation arrows */}
      {canGoPrev && (
        <button
          onClick={onPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full border border-white/20 transition-colors"
          aria-label={`Previous ${position} image`}
        >
          <ChevronLeft size={16} />
        </button>
      )}
      {canGoNext && (
        <button
          onClick={onNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full border border-white/20 transition-colors"
          aria-label={`Next ${position} image`}
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* Image container */}
      <div
        className={`w-full h-full flex items-center justify-center ${isDragging ? 'cursor-grabbing' : state.zoom > 1 ? 'cursor-grab' : 'cursor-default'}`}
        onWheel={onWheel}
        onMouseDown={(e) => onDragStart(e)}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={(e) => onDragStart(e)}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
      >
        {src ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={src}
              initial={{ opacity: 0 }}
              animate={{ opacity: imageLoaded ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative"
              style={{
                transform: `scale(${state.zoom}) translate(${state.pan.x / state.zoom}px, ${state.pan.y / state.zoom}px)`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
            >
              <img
                src={src}
                alt={asset.asset.filename || 'Compare image'}
                onLoad={() => setImageLoaded(true)}
                className="max-w-full max-h-full object-contain select-none"
                draggable={false}
              />
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="text-white/60">No image available</div>
        )}

        {/* Loading indicator */}
        {src && !imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-2 left-2 z-20 px-2 py-1 bg-black/70 rounded text-white text-xs">
        {Math.round(state.zoom * 100)}%
      </div>
    </div>
  );
};

/**
 * LightboxCompare - Side-by-side photo comparison
 */
export const LightboxCompare: React.FC<LightboxCompareProps> = ({
  assets,
  primaryIndex,
  secondaryIndex,
  onPrimaryChange,
  onSecondaryChange,
  onExit,
  getPreviewUrl,
  initialLayout = 'horizontal',
  initialSyncZoom = true,
  initialSyncPan = true,
  className = '',
}) => {
  const [layout, setLayout] = useState<'horizontal' | 'vertical'>(initialLayout);

  // Get assets
  const primaryAsset = assets[primaryIndex];
  const secondaryAsset = assets[secondaryIndex];

  // Get preview URLs
  const primaryUrl = primaryAsset ? getPreviewUrl(primaryAsset.asset_id) : undefined;
  const secondaryUrl = secondaryAsset ? getPreviewUrl(secondaryAsset.asset_id) : undefined;

  // Use compare hook
  const compare = useLightboxCompare({
    primaryIndex,
    secondaryIndex,
    syncZoom: initialSyncZoom,
    syncPan: initialSyncPan,
    onPrimaryChange,
    onSecondaryChange,
  });

  // Navigation helpers
  const canPrimaryGoPrev = primaryIndex > 0;
  const canPrimaryGoNext = primaryIndex < assets.length - 1;
  const canSecondaryGoPrev = secondaryIndex > 0;
  const canSecondaryGoNext = secondaryIndex < assets.length - 1;

  const handlePrimaryPrev = useCallback(() => {
    if (canPrimaryGoPrev) {
      onPrimaryChange(primaryIndex - 1);
    }
  }, [canPrimaryGoPrev, primaryIndex, onPrimaryChange]);

  const handlePrimaryNext = useCallback(() => {
    if (canPrimaryGoNext) {
      onPrimaryChange(primaryIndex + 1);
    }
  }, [canPrimaryGoNext, primaryIndex, onPrimaryChange]);

  const handleSecondaryPrev = useCallback(() => {
    if (canSecondaryGoPrev) {
      onSecondaryChange(secondaryIndex - 1);
    }
  }, [canSecondaryGoPrev, secondaryIndex, onSecondaryChange]);

  const handleSecondaryNext = useCallback(() => {
    if (canSecondaryGoNext) {
      onSecondaryChange(secondaryIndex + 1);
    }
  }, [canSecondaryGoNext, secondaryIndex, onSecondaryChange]);

  // Toggle layout
  const toggleLayout = useCallback(() => {
    setLayout((prev) => (prev === 'horizontal' ? 'vertical' : 'horizontal'));
  }, []);

  // Grid style based on layout
  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns: layout === 'horizontal' ? '1fr 1fr' : '1fr',
      gridTemplateRows: layout === 'vertical' ? '1fr 1fr' : '1fr',
      gap: '2px',
    }),
    [layout]
  );

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onExit();
          break;
        case '+':
        case '=':
          compare.zoomIn();
          break;
        case '-':
          compare.zoomOut();
          break;
        case '0':
          compare.reset();
          break;
        case 's':
        case 'S':
          compare.swap();
          break;
        case 'l':
        case 'L':
          toggleLayout();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onExit, compare, toggleLayout]);

  if (!primaryAsset || !secondaryAsset) {
    return (
      <div className={`fixed inset-0 bg-black flex items-center justify-center z-[10000] ${className}`}>
        <div className="text-white">Select two images to compare</div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 bg-black z-[10000] ${className}`}>
      {/* Close Button */}
      <AppButton
        variant="ghost"
        size="icon"
        onClick={onExit}
        className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white border-white/20"
        aria-label="Exit compare mode"
      >
        <X size={24} />
      </AppButton>

      {/* Compare Grid */}
      <div className="absolute inset-0 top-0 bottom-16" style={gridStyle}>
        {/* Primary Image */}
        <CompareImage
          asset={primaryAsset}
          src={primaryUrl}
          state={compare.primaryState}
          label="A"
          position="primary"
          canGoPrev={canPrimaryGoPrev}
          canGoNext={canPrimaryGoNext}
          onPrev={handlePrimaryPrev}
          onNext={handlePrimaryNext}
          onWheel={(e) => compare.handleWheel(e, 'primary')}
          onDragStart={(e) => compare.handleDragStart(e, 'primary')}
          onDragMove={compare.handleDragMove}
          onDragEnd={compare.handleDragEnd}
          isDragging={compare.isDragging}
        />

        {/* Divider */}
        <div
          className={`absolute z-10 bg-white/30 ${
            layout === 'horizontal'
              ? 'w-0.5 h-full left-1/2 -translate-x-1/2 top-0'
              : 'h-0.5 w-full top-1/2 -translate-y-1/2 left-0'
          }`}
        />

        {/* Secondary Image */}
        <CompareImage
          asset={secondaryAsset}
          src={secondaryUrl}
          state={compare.secondaryState}
          label="B"
          position="secondary"
          canGoPrev={canSecondaryGoPrev}
          canGoNext={canSecondaryGoNext}
          onPrev={handleSecondaryPrev}
          onNext={handleSecondaryNext}
          onWheel={(e) => compare.handleWheel(e, 'secondary')}
          onDragStart={(e) => compare.handleDragStart(e, 'secondary')}
          onDragMove={compare.handleDragMove}
          onDragEnd={compare.handleDragEnd}
          isDragging={compare.isDragging}
        />
      </div>

      {/* Controls Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4">
        <div className="flex items-center justify-center gap-4">
          {/* Zoom controls */}
          <div className="flex items-center gap-2 bg-black/50 rounded-lg px-3 py-2">
            <AppButton
              variant="ghost"
              size="icon"
              onClick={compare.zoomOut}
              disabled={compare.primaryState.zoom <= 0.5}
              className="text-white hover:bg-white/20 h-8 w-8"
              aria-label="Zoom out"
            >
              <ZoomOut size={18} />
            </AppButton>
            <span className="text-white text-sm min-w-[50px] text-center">
              {Math.round(compare.primaryState.zoom * 100)}%
            </span>
            <AppButton
              variant="ghost"
              size="icon"
              onClick={compare.zoomIn}
              disabled={compare.primaryState.zoom >= 5}
              className="text-white hover:bg-white/20 h-8 w-8"
              aria-label="Zoom in"
            >
              <ZoomIn size={18} />
            </AppButton>
            <AppButton
              variant="ghost"
              size="icon"
              onClick={compare.reset}
              className="text-white hover:bg-white/20 h-8 w-8 ml-1"
              aria-label="Reset zoom"
            >
              <RotateCcw size={18} />
            </AppButton>
          </div>

          {/* Sync controls */}
          <div className="flex items-center gap-2 bg-black/50 rounded-lg px-3 py-2">
            <AppButton
              variant="ghost"
              size="icon"
              onClick={compare.toggleSyncZoom}
              className={`h-8 w-8 ${compare.isSyncedZoom ? 'text-primary bg-primary/20' : 'text-white hover:bg-white/20'}`}
              aria-label={compare.isSyncedZoom ? 'Unsync zoom' : 'Sync zoom'}
              title={compare.isSyncedZoom ? 'Zoom synced (click to unsync)' : 'Zoom not synced (click to sync)'}
            >
              {compare.isSyncedZoom ? <Link size={18} /> : <Unlink size={18} />}
            </AppButton>
            <span className="text-white/60 text-xs">Sync</span>
          </div>

          {/* Swap images */}
          <AppButton
            variant="ghost"
            size="icon"
            onClick={compare.swap}
            className="text-white hover:bg-white/20 bg-black/50 h-10 w-10"
            aria-label="Swap images"
            title="Swap images (S)"
          >
            <ArrowLeftRight size={20} />
          </AppButton>

          {/* Layout toggle */}
          <AppButton
            variant="ghost"
            size="icon"
            onClick={toggleLayout}
            className="text-white hover:bg-white/20 bg-black/50 h-10 w-10"
            aria-label={layout === 'horizontal' ? 'Switch to vertical layout' : 'Switch to horizontal layout'}
            title={`Switch to ${layout === 'horizontal' ? 'vertical' : 'horizontal'} layout (L)`}
          >
            {layout === 'horizontal' ? <Rows size={20} /> : <Columns size={20} />}
          </AppButton>
        </div>

        {/* Keyboard hints */}
        <div className="flex items-center justify-center gap-4 mt-2 text-white/40 text-xs">
          <span>+/- Zoom</span>
          <span>0 Reset</span>
          <span>S Swap</span>
          <span>L Layout</span>
          <span>Esc Exit</span>
        </div>
      </div>
    </div>
  );
};

export default LightboxCompare;
