/**
 * Oakwood Premium Cover - Rich wooden aesthetic
 *
 * Features:
 * - Warm wood grain texture with oak-inspired colors
 * - Layered depth with multiple shadow effects
 * - Luxury leather-like border frame
 * - Classic portfolio presentation
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverOakwoodProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverOakwood = React.forwardRef<HTMLDivElement, CoverOakwoodProps>(
  ({ title = 'Gallery Title', subtitle = 'Professional Photography', config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full relative flex items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, #5D4037 0%, #6D4C41 50%, #8D6E63 100%)`,
        }}
      >
        {/* Wood grain texture overlay */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.1) 2px,
              rgba(0, 0, 0, 0.1) 4px
            )`,
          }}
        />

        {/* Outer leather-like border */}
        <div className="absolute inset-8 border-12 border-yellow-900/40 shadow-2xl" />

        {/* Inner decorative frame */}
        <div className="absolute inset-12 border-1 border-yellow-800/30" />

        {/* Subtle vignette effect */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)`,
          }}
        />

        {/* Content */}
        {config.cover.titleVisible && (
          <div className="relative z-10 text-center px-12 max-w-2xl">
            {/* Decorative top element */}
            <div className="mb-6 flex justify-center items-center gap-3">
              <div className="w-12 h-px bg-yellow-700/60" />
              <div className="w-2 h-2 rounded-full bg-yellow-700/60" />
              <div className="w-12 h-px bg-yellow-700/60" />
            </div>

            <h1
              className="text-6xl font-bold text-amber-50 mb-3"
              style={{
                fontFamily: 'var(--font-heading)',
                letterSpacing: 'var(--heading-letter-spacing)',
                lineHeight: `var(--heading-line-height)`,
                textShadow: '3px 3px 8px rgba(0, 0, 0, 0.4)',
              }}
            >
              {title}
            </h1>

            {subtitle && (
              <p
                className="text-amber-100/80 text-lg"
                style={{
                  fontFamily: 'var(--font-body)',
                  letterSpacing: 'var(--body-letter-spacing)',
                  lineHeight: `var(--body-line-height)`,
                }}
              >
                {subtitle}
              </p>
            )}

            {/* Decorative bottom element */}
            <div className="mt-6 flex justify-center items-center gap-3">
              <div className="w-12 h-px bg-yellow-700/60" />
              <div className="w-2 h-2 rounded-full bg-yellow-700/60" />
              <div className="w-12 h-px bg-yellow-700/60" />
            </div>
          </div>
        )}
      </div>
    );
  }
);

CoverOakwood.displayName = 'CoverOakwood';
export default CoverOakwood;
