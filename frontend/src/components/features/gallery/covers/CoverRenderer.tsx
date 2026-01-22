/**
 * Cover Renderer Factory
 *
 * Dynamically loads and renders the correct cover style component.
 * Uses React.lazy() for code splitting - each style loads on demand.
 *
 * Features:
 * - Dynamic component loading based on style ID
 * - Lazy loading for performance optimization
 * - Suspense boundary with fallback
 * - Type-safe style ID validation
 * - Fallback for unimplemented styles
 *
 * Usage:
 * ```tsx
 * <CoverRenderer
 *   style="classic"
 *   title="My Gallery"
 *   coverImageUrl="https://..."
 *   focalPoint={{ x: 50, y: 50 }}
 *   overlayOpacity={0.3}
 *   config={{ theme: { id: 'brand' }, typography: { pairingId: 'modern' } }}
 * />
 * ```
 */

import React, { Suspense, ComponentType } from 'react';
import { GalleryDesignConfig } from '../../../../types/gallery-design';

interface CoverProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

interface CoverRendererProps extends CoverProps {
  style: string;
}

/**
 * Lazy-loaded cover style components
 * Each style is split into its own chunk for performance
 *
 * Basic styles (3)
 */
const CoverCenter = React.lazy(() => import('./styles/CoverCenter'));
const CoverLeft = React.lazy(() => import('./styles/CoverLeft'));
const CoverNone = React.lazy(() => import('./styles/CoverNone'));

/**
 * Text styles (8)
 */
const CoverVintage = React.lazy(() => import('./styles/CoverVintage'));
const CoverNovel = React.lazy(() => import('./styles/CoverNovel'));
const CoverFrame = React.lazy(() => import('./styles/CoverFrame'));
const CoverStripe = React.lazy(() => import('./styles/CoverStripe'));
const CoverDivider = React.lazy(() => import('./styles/CoverDivider'));
const CoverJournal = React.lazy(() => import('./styles/CoverJournal'));
const CoverStamp = React.lazy(() => import('./styles/CoverStamp'));
const CoverOutline = React.lazy(() => import('./styles/CoverOutline'));

/**
 * Advanced styles (5)
 */
const CoverClassic = React.lazy(() => import('./styles/CoverClassic'));
const CoverSplit = React.lazy(() => import('./styles/CoverSplit'));
const CoverLabel = React.lazy(() => import('./styles/CoverLabel'));
const CoverBorder = React.lazy(() => import('./styles/CoverBorder'));
const CoverAlbum = React.lazy(() => import('./styles/CoverAlbum'));

/**
 * Premium styles (12)
 */
const CoverCliff = React.lazy(() => import('./styles/CoverCliff'));
const CoverCedar = React.lazy(() => import('./styles/CoverCedar'));
const CoverBreeze = React.lazy(() => import('./styles/CoverBreeze'));
const CoverAero = React.lazy(() => import('./styles/CoverAero'));
const CoverSurf = React.lazy(() => import('./styles/CoverSurf'));
const CoverCosmos = React.lazy(() => import('./styles/CoverCosmos'));
const CoverReef = React.lazy(() => import('./styles/CoverReef'));
const CoverBondi = React.lazy(() => import('./styles/CoverBondi'));
const CoverWest = React.lazy(() => import('./styles/CoverWest'));
const CoverOakwood = React.lazy(() => import('./styles/CoverOakwood'));
const CoverEdge = React.lazy(() => import('./styles/CoverEdge'));
const CoverAnchor = React.lazy(() => import('./styles/CoverAnchor'));
const CoverJoy = React.lazy(() => import('./styles/CoverJoy'));

/**
 * Component map: style ID → lazy component
 * Used by factory to select correct renderer
 */
const COVER_COMPONENTS: Record<string, ComponentType<CoverProps>> = {
  // Basic styles
  center: CoverCenter,
  left: CoverLeft,
  none: CoverNone,

  // Text styles
  vintage: CoverVintage,
  novel: CoverNovel,
  frame: CoverFrame,
  stripe: CoverStripe,
  divider: CoverDivider,
  journal: CoverJournal,
  stamp: CoverStamp,
  outline: CoverOutline,

  // Advanced styles
  classic: CoverClassic,
  split: CoverSplit,
  label: CoverLabel,
  border: CoverBorder,
  album: CoverAlbum,

  // Premium styles
  cliff: CoverCliff,
  cedar: CoverCedar,
  breeze: CoverBreeze,
  aero: CoverAero,
  surf: CoverSurf,
  cosmos: CoverCosmos,
  reef: CoverReef,
  bondi: CoverBondi,
  west: CoverWest,
  oakwood: CoverOakwood,
  edge: CoverEdge,
  anchor: CoverAnchor,
  joy: CoverJoy,
};

/**
 * Fallback component for unimplemented or missing styles
 */
const CoverFallback: React.FC<CoverProps> = ({ config }) => (
  <div
    className="w-full h-full flex items-center justify-center"
    style={{
      background: `linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))`,
    }}
  >
    <div className="text-center">
      <div className="text-4xl mb-2">🎨</div>
      <h2 className="font-bold text-xl" style={{ color: 'var(--accent-primary)' }}>
        Cover Style
      </h2>
      <p className="text-sm text-text-secondary mt-1">Loading...</p>
    </div>
  </div>
);

/**
 * Loading placeholder shown while cover component loads
 */
const CoverLoadingPlaceholder: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-secondary via-bg-primary to-bg-tertiary">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
      <p className="text-xs text-text-secondary">Loading style...</p>
    </div>
  </div>
);

/**
 * CoverRenderer Factory
 *
 * Main export: Dynamically renders the correct cover component
 * based on the style ID. Handles lazy loading and provides fallbacks.
 *
 * @param style - Cover style ID (e.g., 'classic', 'vintage', 'cliff')
 * @param props - Props to pass to the cover component
 */
export const CoverRenderer: React.FC<CoverRendererProps> = ({
  style,
  title,
  subtitle,
  coverImageUrl,
  focalPoint,
  overlayOpacity,
  config,
}) => {
  // Get the component for this style
  const CoverComponent = COVER_COMPONENTS[style];

  // If component not found, show fallback
  if (!CoverComponent) {
    return (
      <CoverFallback
        title={title}
        subtitle={subtitle}
        coverImageUrl={coverImageUrl}
        focalPoint={focalPoint}
        overlayOpacity={overlayOpacity}
        config={config}
      />
    );
  }

  // Render with Suspense boundary for lazy loading
  return (
    <Suspense fallback={<CoverLoadingPlaceholder />}>
      <CoverComponent
        title={title}
        subtitle={subtitle}
        coverImageUrl={coverImageUrl}
        focalPoint={focalPoint}
        overlayOpacity={overlayOpacity}
        config={config}
      />
    </Suspense>
  );
};

/**
 * Get list of available cover styles
 * Useful for testing and validation
 */
export const getAvailableCoverStyles = (): string[] => {
  return Object.keys(COVER_COMPONENTS);
};

/**
 * Check if a cover style is available
 */
export const isCoverStyleAvailable = (styleId: string): boolean => {
  return styleId in COVER_COMPONENTS;
};

export default CoverRenderer;
