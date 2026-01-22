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
      className={`${containerClass} max-w-full`}
      style={{
        // Smooth transition for width changes (T052)
        transition: 'width 300ms ease-in-out, transform 200ms ease-out',
        width: containerWidth ? `${containerWidth}px` : '100%',
        // Set container type for container queries (T053)
        containerType: containerQueriesSupported ? 'inline-size' : undefined,
      }}
    >
      {/* Preview Header with Collaboration Info */}
      <div className="mb-6 bg-gray-100 dark:bg-black/30 backdrop-blur-xl border border-gray-300 dark:border-white/10 rounded-2xl p-5 transition-opacity duration-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className={`text-gray-900 dark:text-white/90 font-bold uppercase tracking-[0.2em] ${textClasses.body}`}>
            {coverStyle?.name || 'Unknown Style'}
          </h3>

          {/* Viewer Count Badge */}
          {viewerCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-200 dark:bg-white/5 rounded-full border border-gray-400 dark:border-white/10 transition-transform duration-200 hover:scale-105">
              <EyeIcon className="h-3 w-3 text-cyan-400" />
              <span className="text-[10px] font-bold text-gray-900 dark:text-white/90 leading-none">{viewerCount}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-1">
            <div className={`text-[9px] text-gray-600 dark:text-white/40 font-semibold tracking-wide uppercase ${textClasses.body}`}>
              Viewport · Theme · Font
            </div>
            <p className={`text-gray-700 dark:text-white/70 font-medium ${textClasses.body}`}>
              <span className="inline-block px-2 py-1 bg-gray-200 dark:bg-white/5 rounded border border-gray-400 dark:border-white/10 mr-2">{getViewportLabel()}</span>
              <span className="inline-block px-2 py-1 bg-gray-200 dark:bg-white/5 rounded border border-gray-400 dark:border-white/10 mr-2">{config.theme.id}</span>
              <span className="inline-block px-2 py-1 bg-gray-200 dark:bg-white/5 rounded border border-gray-400 dark:border-white/10">{config.typography.pairingId}</span>
            </p>
            {!containerQueriesSupported && (
              <p className="text-[9px] text-amber-600 dark:text-amber-400/80" title="Container queries not supported, using viewport queries">
                ⓘ Responsive fallback mode active
              </p>
            )}
          </div>

          {/* Collaborators */}
          {collaborators.length > 0 && (
            <CollaboratorPresence collaborators={collaborators} maxVisible={3} className="scale-90" />
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
        <h4 className={`text-gray-600 dark:text-white/50 font-semibold tracking-wide mb-4 group-hover/grid:text-gray-700 dark:group-hover/grid:text-white/70 transition-colors ${textClasses.body}`}>
          Secondary gallery section
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
              className="aspect-square rounded-2xl bg-gray-200 dark:bg-white/[0.03] border border-gray-300 dark:border-white/[0.05] flex items-center justify-center transition-all duration-500 hover:bg-gray-300 dark:hover:bg-white/[0.08] hover:border-gray-400 dark:hover:border-white/20 hover:scale-[1.02] hover:shadow-xl group/item"
            >
              <div className="w-8 h-px bg-gray-400 dark:bg-white/10 group-hover/item:bg-cyan-400 group-hover/item:w-12 transition-all duration-500" />
            </div>
          ))}
        </div>
        <div className={`mt-4 text-gray-600 dark:text-white/50 text-[9px] font-semibold tracking-wide uppercase ${textClasses.body}`}>
          Layout settings
        </div>
        <div className={`mt-2 flex gap-3 flex-wrap`}>
          <span className="inline-block px-2 py-1 bg-gray-200 dark:bg-white/5 rounded border border-gray-400 dark:border-white/10 text-gray-700 dark:text-white/60 text-[10px]">
            Layout: <span className="text-gray-900 dark:text-white/80 font-semibold">{config.grid.style}</span>
          </span>
          <span className="inline-block px-2 py-1 bg-gray-200 dark:bg-white/5 rounded border border-gray-400 dark:border-white/10 text-gray-700 dark:text-white/60 text-[10px]">
            Size: <span className="text-gray-900 dark:text-white/80 font-semibold">{config.grid.size}</span>
          </span>
        </div>
      </div>

      {/* Cover Info Section - Balanced & Centered */}
      <div className="mt-12 p-8 bg-gray-100 dark:bg-black/40 backdrop-blur-3xl rounded-[2.5rem] border border-gray-300 dark:border-white/10 flex flex-wrap justify-center gap-x-12 gap-y-6 transition-all duration-300">
        <div className="text-center group/info">
          <span className="text-gray-600 dark:text-white/50 font-semibold tracking-wide text-[10px] group-hover/info:text-cyan-600 dark:group-hover/info:text-cyan-400/70 transition-colors">Style atmosphere</span>
          <div className="text-gray-900 dark:text-white/80 font-semibold text-xs mt-1">{coverStyle?.name}{coverStyle?.premium && ' ✨'}</div>
        </div>
        <div className="text-center group/info">
          <span className="text-gray-600 dark:text-white/50 font-semibold tracking-wide text-[10px] group-hover/info:text-cyan-600 dark:group-hover/info:text-cyan-400/70 transition-colors">Visual identity</span>
          <div className="text-gray-900 dark:text-white/80 font-semibold text-xs mt-1">{config.theme.id} • {config.theme.mode}</div>
        </div>
        <div className="text-center group/info">
          <span className="text-gray-600 dark:text-white/50 font-semibold tracking-wide text-[10px] group-hover/info:text-cyan-600 dark:group-hover/info:text-cyan-400/70 transition-colors">Type curation</span>
          <div className="text-gray-900 dark:text-white/80 font-semibold text-xs mt-1">{config.typography.pairingId}</div>
        </div>
      </div>
    </div>
  );
};


export default DesignPreviewCanvas;
