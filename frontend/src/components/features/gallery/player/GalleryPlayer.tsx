/**
 * GalleryPlayer
 * Main fullscreen photo viewer shell with zoom/pan/pinch, swipe navigation,
 * filmstrip thumbnails, keyboard controls, and auto-hiding controls.
 *
 * Renders as a portal on document.body with AnimatePresence for smooth transitions.
 * Composes: PlayerToolbar (top) + PlayerZoomContainer (center) + PlayerFilmstrip (bottom).
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDrag } from '@use-gesture/react';
import { useGalleryPlayer } from '../../../../contexts/GalleryPlayerContext';
import { useGalleryInteraction } from '../../../../contexts/GalleryInteractionContext';
import { useLightboxNavigation } from '../../../../hooks/lightbox/useLightboxNavigation';
import { useLightboxAutoHide } from '../../../../hooks/lightbox/useLightboxAutoHide';
import { PlayerToolbar } from './PlayerToolbar';
import { PlayerZoomContainer } from './PlayerZoomContainer';
import type { PlayerZoomContainerRef } from './PlayerZoomContainer';
import { PlayerFilmstrip } from './PlayerFilmstrip';
import { PlayerExifPanel } from './PlayerExifPanel';
import { CommentPanel } from '../public/CommentPanel';

const SWIPE_THRESHOLD = 50;

export const GalleryPlayer: React.FC = () => {
  const {
    isOpen,
    currentIndex,
    assets,
    currentAsset,
    goToNext,
    goToPrevious,
    closePlayer,
    openPlayer,
  } = useGalleryPlayer();

  const { favorites, toggleFavorite, isProofingEnabled } = useGalleryInteraction();

  // Zoom state — when zoomed, disable swipe navigation
  const [isZoomed, setIsZoomed] = useState(false);
  // EXIF panel state (toggled by toolbar info button and 'I' key)
  const [showExif, setShowExif] = useState(false);
  // Comment panel state
  const [showComments, setShowComments] = useState(false);

  const zoomContainerRef = useRef<PlayerZoomContainerRef>(null);

  // Auto-hide controls
  const {
    controlsVisible,
    handleMouseMove,
    handleControlsEnter,
    handleControlsLeave,
    showControls,
  } = useLightboxAutoHide({ isOpen });

  // Keyboard navigation via shared hook
  const {
    canGoPrevious,
    canGoNext,
    positionLabel,
  } = useLightboxNavigation({
    currentIndex,
    totalAssets: assets.length,
    isOpen,
    onNavigate: openPlayer,
    onClose: closePlayer,
    onToggleMetadata: () => setShowExif((prev) => !prev),
    enableKeyboard: true,
  });

  // Reset zoom and EXIF on asset change
  useEffect(() => {
    setIsZoomed(false);
    setShowExif(false);
    setShowComments(false);
    zoomContainerRef.current?.resetTransform();
  }, [currentIndex]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  // Zoom change callback from PlayerZoomContainer
  const handleZoomChange = useCallback((scale: number) => {
    setIsZoomed(scale > 1.05);
  }, []);

  // Swipe gestures via @use-gesture/react
  const bindDrag = useDrag(
    ({ movement: [mx, my], direction: [dx, dy], velocity: [vx, vy], last, cancel }) => {
      if (!last || isZoomed) return;

      const absMx = Math.abs(mx);
      const absMy = Math.abs(my);

      // Horizontal swipe for navigation
      if (absMx > SWIPE_THRESHOLD && absMx > absMy) {
        if (dx > 0 && canGoPrevious) {
          goToPrevious();
        } else if (dx < 0 && canGoNext) {
          goToNext();
        }
        return;
      }

      // Vertical swipe down to close
      if (my > SWIPE_THRESHOLD && absMy > absMx && dy > 0) {
        closePlayer();
      }
    },
    { filterTaps: true, threshold: 10 },
  );

  // Toggle info
  const handleToggleInfo = useCallback(() => {
    setShowExif((prev) => !prev);
  }, []);

  if (!isOpen || !currentAsset) return null;

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="gallery-player"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center touch-none select-none"
          data-testid="gallery-player-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Gallery player"
          onMouseMove={handleMouseMove}
        >
          {/* Controls wrapper — fades with auto-hide */}
          <div
            className={`absolute inset-0 z-50 pointer-events-none transition-opacity duration-300 ${
              controlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Top toolbar */}
            <div className="pointer-events-auto">
              <PlayerToolbar
                positionLabel={positionLabel}
                onClose={closePlayer}
                onToggleInfo={handleToggleInfo}
                showInfoActive={showExif}
                onMouseEnter={handleControlsEnter}
                onMouseLeave={handleControlsLeave}
                isFavorited={currentAsset ? favorites.has(currentAsset.asset_id) : false}
                onToggleFavorite={isProofingEnabled && currentAsset ? () => toggleFavorite(currentAsset.asset_id) : undefined}
                onToggleComments={isProofingEnabled ? () => setShowComments((prev) => !prev) : undefined}
                showCommentsActive={showComments}
              />
            </div>

            {/* Navigation arrows (desktop only) */}
            {assets.length > 1 && (
              <>
                {canGoPrevious && (
                  <div className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 hidden md:flex">
                    <button
                      className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToPrevious();
                      }}
                      aria-label="Previous photo"
                    >
                      <ChevronLeft size={28} />
                    </button>
                  </div>
                )}
                {canGoNext && (
                  <div className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 hidden md:flex">
                    <button
                      className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToNext();
                      }}
                      aria-label="Next photo"
                    >
                      <ChevronRight size={28} />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Filmstrip */}
            <div className="pointer-events-auto">
              <PlayerFilmstrip />
            </div>
          </div>

          {/* Main image with gesture binding (NOT inside auto-hide wrapper) */}
          <div className="relative w-full h-full flex items-center justify-center" {...bindDrag()}>
            <PlayerZoomContainer
              ref={zoomContainerRef}
              asset={currentAsset}
              galleryId={currentAsset.gallery_id}
              onZoomChange={handleZoomChange}
            />
          </div>

          {/* EXIF metadata panel — slide-up overlay */}
          <AnimatePresence>
            {showExif && currentAsset && (
              <PlayerExifPanel
                asset={currentAsset}
                galleryId={currentAsset.gallery_id}
              />
            )}
          </AnimatePresence>

          {/* Comment panel — slide from right */}
          {currentAsset && (
            <CommentPanel
              assetId={currentAsset.asset_id}
              isOpen={showComments}
              onClose={() => setShowComments(false)}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};
