/**
 * None Style Cover
 *
 * Features:
 * - Full-bleed cover image
 * - No text overlay
 * - Image fills entire cover area
 * - Respects focal point positioning
 * - Minimal, clean design
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverNoneProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverNone = React.forwardRef<HTMLDivElement, CoverNoneProps>(
  ({ coverImageUrl, focalPoint, config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full overflow-hidden"
        style={{
          backgroundImage: coverImageUrl ? `url(${coverImageUrl})` : undefined,
          backgroundPosition: `${focalPoint.x}% ${focalPoint.y}%`,
          backgroundSize: 'cover',
          backgroundAttachment: 'fixed',
          background: !coverImageUrl
            ? `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`
            : undefined,
        }}
      />
    );
  }
);

CoverNone.displayName = 'CoverNone';

export default CoverNone;
