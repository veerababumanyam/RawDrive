import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { PublicGalleryAsset } from '../types/gallery';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GalleryPlayerContextValue {
  /** Whether the player/lightbox is open */
  isOpen: boolean;
  /** Current asset index within the assets array */
  currentIndex: number;
  /** Reference to the loaded assets array */
  assets: PublicGalleryAsset[];
  /** Open the player at a specific index */
  openPlayer: (index: number) => void;
  /** Close the player */
  closePlayer: () => void;
  /** Navigate to the next asset (wraps around) */
  goToNext: () => void;
  /** Navigate to the previous asset (wraps around) */
  goToPrevious: () => void;
  /** The currently displayed asset (or null if closed) */
  currentAsset: PublicGalleryAsset | null;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GalleryPlayerContext = createContext<GalleryPlayerContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface GalleryPlayerProviderProps {
  /** The array of assets that the player can navigate through */
  assets: PublicGalleryAsset[];
  children: React.ReactNode;
}

/**
 * Manages player/lightbox open/close state and navigation index.
 * Phase 17 will extend this to integrate lightbox hooks (zoom, gestures, slideshow).
 */
export const GalleryPlayerProvider: React.FC<GalleryPlayerProviderProps> = ({
  assets,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const openPlayer = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, assets.length - 1));
      setCurrentIndex(clampedIndex);
      setIsOpen(true);
    },
    [assets.length],
  );

  const closePlayer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const goToNext = useCallback(() => {
    if (assets.length === 0) return;
    setCurrentIndex((prev) => (prev < assets.length - 1 ? prev + 1 : 0));
  }, [assets.length]);

  const goToPrevious = useCallback(() => {
    if (assets.length === 0) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : assets.length - 1));
  }, [assets.length]);

  const currentAsset = useMemo(
    () => (isOpen && assets.length > 0 ? assets[currentIndex] ?? null : null),
    [isOpen, assets, currentIndex],
  );

  const value = useMemo<GalleryPlayerContextValue>(
    () => ({
      isOpen,
      currentIndex,
      assets,
      openPlayer,
      closePlayer,
      goToNext,
      goToPrevious,
      currentAsset,
    }),
    [isOpen, currentIndex, assets, openPlayer, closePlayer, goToNext, goToPrevious, currentAsset],
  );

  return (
    <GalleryPlayerContext.Provider value={value}>
      {children}
    </GalleryPlayerContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Consume gallery player context. Must be used within a GalleryPlayerProvider.
 */
export const useGalleryPlayer = (): GalleryPlayerContextValue => {
  const ctx = useContext(GalleryPlayerContext);
  if (!ctx) {
    throw new Error('useGalleryPlayer must be used within a GalleryPlayerProvider');
  }
  return ctx;
};
