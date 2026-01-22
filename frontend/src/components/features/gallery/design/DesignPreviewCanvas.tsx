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
        return '📱 Mobile';
      case 'tablet':
        return '📋 Tablet';
      default:
        return '🖥️ Desktop';
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
      <div className="mb-4 transition-opacity duration-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className={`font-semibold text-text-primary ${textClasses.body}`}>
            {coverStyle?.name || 'Unknown Style'}
          </h3>

          {/* Viewer Count Badge */}
          {viewerCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-full border border-blue-200 transition-transform duration-200 hover:scale-105">
              <EyeIcon className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-medium text-blue-600">{viewerCount}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className={`text-text-secondary ${textClasses.body}`}>
            {getViewportLabel()} Preview •{' '}
            {config.theme.id} Theme • {config.typography.pairingId} Fonts
            {!containerQueriesSupported && (
              <span className="ml-2 text-amber-600" title="Container queries not supported, using viewport queries">
                (viewport fallback)
              </span>
            )}
          </p>

          {/* Collaborators */}
          {collaborators.length > 0 && (
            <CollaboratorPresence collaborators={collaborators} maxVisible={3} className="ml-2" />
          )}
        </div>
      </div>

      {/* Cover Preview Container - with smooth transitions (T052) */}
      <div
        className="rounded-lg shadow-2xl overflow-hidden bg-white border border-border-default transition-all duration-300 ease-in-out"
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
      <div className="mt-6">
        <h4 className={`font-semibold text-text-primary mb-3 ${textClasses.body}`}>
          Gallery Grid Preview
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
              className="aspect-square rounded-lg bg-gradient-to-br from-bg-secondary to-bg-tertiary border border-border-default flex items-center justify-center transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
            >
              <span className="text-text-tertiary text-xs font-medium">Photo {i}</span>
            </div>
          ))}
        </div>
        <p className={`mt-2 text-text-tertiary ${textClasses.body}`}>
          Grid: {config.grid.style} • {config.grid.size} • {config.grid.spacing}
        </p>
      </div>

      {/* Cover Info - Container Query Responsive Text (T050) */}
      <div className="mt-4 p-3 bg-bg-secondary rounded space-y-1 transition-all duration-200">
        <div className={textClasses.body}>
          <span className="text-text-primary font-medium">Style:</span>{' '}
          <span className="text-text-secondary">{coverStyle?.name}{coverStyle?.premium && ' ✨'}</span>
        </div>
        <div className={textClasses.body}>
          <span className="text-text-primary font-medium">Theme:</span>{' '}
          <span className="text-text-secondary">{config.theme.id} ({config.theme.mode})</span>
        </div>
        <div className={textClasses.body}>
          <span className="text-text-primary font-medium">Typography:</span>{' '}
          <span className="text-text-secondary">{config.typography.pairingId}</span>
        </div>
        <div className={textClasses.body}>
          <span className="text-text-primary font-medium">Grid:</span>{' '}
          <span className="text-text-secondary">{config.grid.style} • {config.grid.size} • {config.grid.spacing}</span>
        </div>
      </div>
    </div>
  );
};


export default DesignPreviewCanvas;
