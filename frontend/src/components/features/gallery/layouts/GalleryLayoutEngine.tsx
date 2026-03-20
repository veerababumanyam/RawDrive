/**
 * GalleryLayoutEngine — Strategy pattern dispatcher for layout modes.
 *
 * Selects a layout renderer based on the current LayoutStyle value.
 * Wraps the active renderer in AnimatePresence for smooth transitions
 * between layout modes.
 *
 * @module layouts/GalleryLayoutEngine
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LayoutStyle } from '@rawdrive/shared-types';
import { GridLayout } from './GridLayout';
import { JustifiedLayout } from './JustifiedLayout';
import { MosaicLayout } from './MosaicLayout';
import { EnhancedMasonryLayout } from './EnhancedMasonryLayout';
import type { LayoutAsset } from './types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GalleryLayoutEngineProps {
  /** Active layout mode */
  layout: LayoutStyle;
  /** Normalised assets to render */
  assets: LayoutAsset[];
  /** Gap between items in pixels */
  gap?: number;
  /** Callback when an asset is clicked (e.g. open lightbox) */
  onAssetClick?: (asset: LayoutAsset, index: number) => void;
  /** Optional render prop for per-item overlays (e.g. favorite button) */
  itemOverlay?: (asset: LayoutAsset, index: number) => React.ReactNode;
}

// ---------------------------------------------------------------------------
// Placeholder for unimplemented layouts
// ---------------------------------------------------------------------------

const LayoutPlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
      color: '#888',
      fontSize: 16,
      border: '2px dashed #ccc',
      borderRadius: 8,
      padding: 24,
    }}
  >
    {label}
  </div>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GalleryLayoutEngine: React.FC<GalleryLayoutEngineProps> = ({
  layout,
  assets,
  gap = 8,
  onAssetClick,
  itemOverlay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const measure = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
  }, []);

  useEffect(() => {
    measure();

    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [measure]);

  // -----------------------------------------------------------------------
  // Strategy dispatch
  // -----------------------------------------------------------------------

  const renderLayout = () => {
    const rendererProps = { assets, containerWidth, gap, onAssetClick, itemOverlay };

    switch (layout) {
      case 'grid':
        return <GridLayout {...rendererProps} />;
      case 'masonry':
        return <EnhancedMasonryLayout {...rendererProps} />;
      case 'justified':
        return <JustifiedLayout {...rendererProps} />;
      case 'mosaic':
        return <MosaicLayout {...rendererProps} />;
      case 'filmstrip':
        return <LayoutPlaceholder label="Filmstrip layout" />;
      case 'slideshow':
        return <LayoutPlaceholder label="Slideshow layout" />;
      default:
        // Fallback to grid for unknown / future layout values
        return <GridLayout {...rendererProps} />;
    }
  };

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {containerWidth > 0 && (
        <AnimatePresence mode="wait">
          <motion.div
            key={layout}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {renderLayout()}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};
