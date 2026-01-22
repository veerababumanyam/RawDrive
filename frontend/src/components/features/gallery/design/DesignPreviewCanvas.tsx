/**
 * Design Preview Canvas - Gallery Design Studio Preview
 *
 * Renders a live preview of the gallery cover with:
 * - Real-time theme and font application
 * - Cover style preview
 * - Responsive viewport modes (mobile/tablet/desktop)
 * - Container-query responsive preview
 * - Gallery title and basic info
 *
 * Features:
 * - CSS variable injection for instant updates
 * - Zero re-renders for theme changes (CSS-only)
 * - Container queries for accurate device simulation (@sm:, @md:, @lg:)
 * - Smooth transitions for viewport mode changes
 * - Feature detection with fallback for older browsers
 */

import React, { useRef, useEffect, useState } from 'react';
import { GalleryDesignConfig } from '../../../../types/gallery-design';
import { getCoverStyle } from '../../../../constants/coverStyleCatalog';
import { CoverRenderer } from '../covers/CoverRenderer';
import { CollaboratorPresence, type Collaborator } from './CollaboratorPresence';
import { EyeIcon } from 'lucide-react';

/**
 * Check if container queries are supported
 * Uses feature detection for CSS Container Queries
 */
const supportsContainerQueries = (): boolean => {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') {
    return false;
  }
  return CSS.supports('container-type', 'inline-size');
};

interface DesignPreviewCanvasProps {
  config: GalleryDesignConfig;
  galleryId: string;
  viewportMode: {
    type: 'mobile' | 'tablet' | 'desktop';
    width?: number;
  };
  viewerCount?: number;
  collaborators?: Collaborator[];
}

export const DesignPreviewCanvas: React.FC<DesignPreviewCanvasProps> = ({
  config,
  galleryId,
  viewportMode,
  viewerCount = 0,
  collaborators = [],
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [containerQueriesSupported] = useState(() => supportsContainerQueries());

  // Get current cover style info
  const coverStyle = getCoverStyle(config.cover.style);

  // Responsive width based on viewport mode (T051)
  const getContainerWidth = (): number | undefined => {
    if (viewportMode.type === 'mobile') {
      return Math.min(viewportMode.width || 375, 600);
    }
    if (viewportMode.type === 'tablet') {
      return Math.min(viewportMode.width || 768, 900);
    }
    return undefined; // desktop = full width
  };

  const containerWidth = getContainerWidth();

  // Get responsive grid columns based on container width (T049)
  // Uses container queries when supported, fallback to viewport queries
  const getGridColumns = (): string => {
    if (!containerWidth) {
      // Desktop: 3+ columns
      return '@lg:grid-cols-4 @md:grid-cols-3 @sm:grid-cols-2 grid-cols-1';
    }
    if (containerWidth >= 768) {
      // Tablet: 2-3 columns
      return '@md:grid-cols-3 @sm:grid-cols-2 grid-cols-2';
    }
    // Mobile: 1-2 columns
    return '@sm:grid-cols-2 grid-cols-1';
  };

  // Get responsive text sizing (T050)
  const getTextClasses = (): { heading: string; body: string } => {
    return {
      heading: '@lg:text-4xl @md:text-3xl @sm:text-2xl text-xl',
      body: '@lg:text-base @md:text-sm text-xs',
    };
  };

  const containerClass =
    viewportMode.type !== 'desktop'
      ? 'mx-auto'
      : 'w-full';

  // Get viewport icon and label
  const getViewportLabel = () => {
    switch (viewportMode.type) {
      case 'mobile':
        return 'Mobile';
      case 'tablet':
        return 'Tablet';
      default:
        return 'Desktop';
    }
  };

  const textClasses = getTextClasses();
  const gridClasses = getGridColumns();

  return (
    <div
      ref={previewRef}
      className={`${containerClass} max-w-4xl`}
      style={{
        // Smooth transition for width changes (T052)
        transition: 'width 300ms ease-in-out, transform 200ms ease-out',
        width: containerWidth ? `${containerWidth}px` : undefined,
        // Set container type for container queries (T053)
        containerType: containerQueriesSupported ? 'inline-size' : undefined,
      }}
    >
      {/* Preview Header with Collaboration Info */}
      <div className="mb-6 bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-5 transition-opacity duration-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className={`text-white/90 font-bold uppercase tracking-[0.2em] ${textClasses.body}`}>
            {coverStyle?.name || 'Unknown Style'}
          </h3>

          {/* Viewer Count Badge */}
          {viewerCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10 transition-transform duration-200 hover:scale-105">
              <EyeIcon className="h-3 w-3 text-cyan-400" />
              <span className="text-[10px] font-bold text-white/90 leading-none">{viewerCount}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className={`text-white/40 font-medium ${textClasses.body}`}>
            {getViewportLabel()} Mode •{' '}
            <span className="text-white/60">{config.theme.id}</span> • <span className="text-white/60">{config.typography.pairingId}</span>
            {!containerQueriesSupported && (
              <span className="ml-2 text-amber-500/80" title="Container queries not supported, using viewport queries">
                (fallback)
              </span>
            )}
          </p>

          {/* Collaborators */}
          {collaborators.length > 0 && (
            <CollaboratorPresence collaborators={collaborators} maxVisible={3} className="ml-2 scale-90" />
          )}
        </div>
      </div>

      {/* Cover Preview Container - with smooth transitions (T052) */}
      <div
        className="rounded-3xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)] overflow-hidden bg-black border border-white/20 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{
          aspectRatio:
            viewportMode.type === 'mobile'
              ? '9/16'
              : viewportMode.type === 'tablet'
                ? '4/3'
                : '16/9',
        }}
      >
        <CoverRenderer
          style={config.cover.style}
          title="Gallery Title"
          subtitle="Your wedding story"
          coverImageUrl={undefined}
          focalPoint={config.cover.focalPoint}
          overlayOpacity={config.cover.overlayOpacity}
          config={config}
        />
      </div>

      {/* Gallery Grid Preview - Container Query Responsive (T048, T049) */}
      <div className="mt-12 group/grid">
        <h4 className={`text-white/30 font-bold uppercase tracking-[0.2em] mb-4 group-hover/grid:text-white/50 transition-colors ${textClasses.body}`}>
          Secondary Gallery Section
        </h4>
        <div
          className={`grid gap-2 transition-all duration-300 ${gridClasses}`}
          style={{
            // Container type for grid container queries
            containerType: containerQueriesSupported ? 'inline-size' : undefined,
          }}
        >
          {/* Sample grid items to demonstrate responsive behavior */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center transition-all duration-500 hover:bg-white/[0.08] hover:border-white/20 hover:scale-[1.02] hover:shadow-xl group/item"
            >
              <div className="w-8 h-px bg-white/10 group-hover/item:bg-cyan-400 group-hover/item:w-12 transition-all duration-500" />
            </div>
          ))}
        </div>
        <p className={`mt-4 text-white/20 font-medium ${textClasses.body}`}>
          Grid Style: <span className="text-white/40">{config.grid.style}</span> • <span className="text-white/40">{config.grid.size}</span>
        </p>
      </div>

      {/* Cover Info Section - Balanced & Centered */}
      <div className="mt-12 p-8 bg-black/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 flex flex-wrap justify-center gap-x-12 gap-y-6 transition-all duration-300">
        <div className="text-center group/info">
          <span className="text-white/20 font-black uppercase tracking-[0.3em] text-[8px] group-hover/info:text-cyan-400/50 transition-colors">Style Atmosphere</span>
          <div className="text-white/80 font-bold text-xs mt-1">{coverStyle?.name}{coverStyle?.premium && ' ✨'}</div>
        </div>
        <div className="text-center group/info">
          <span className="text-white/20 font-black uppercase tracking-[0.3em] text-[8px] group-hover/info:text-cyan-400/50 transition-colors">Visual Identity</span>
          <div className="text-white/80 font-bold text-xs mt-1">{config.theme.id} • {config.theme.mode}</div>
        </div>
        <div className="text-center group/info">
          <span className="text-white/20 font-black uppercase tracking-[0.3em] text-[8px] group-hover/info:text-cyan-400/50 transition-colors">Type Curation</span>
          <div className="text-white/80 font-bold text-xs mt-1">{config.typography.pairingId}</div>
        </div>
      </div>
    </div>
  );
};


export default DesignPreviewCanvas;
