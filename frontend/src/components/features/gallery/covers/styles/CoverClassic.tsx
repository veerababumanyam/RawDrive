/**
 * Classic Style Cover (Advanced)
 *
 * Features:
 * - Gradient background with accent colors
 * - Text positioned at bottom-left
 * - Decorative geometric shape
 * - Professional, premium feel
 * - Full opacity overlay
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverClassicProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverClassic = React.forwardRef<HTMLDivElement, CoverClassicProps>(
  ({ title = 'Gallery Title', subtitle = 'Professional Photography', coverImageUrl, focalPoint, overlayOpacity, config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full relative flex items-end justify-start overflow-hidden"
      >
        {/* Background Gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
            opacity: 0.9,
          }}
        />

        {/* Decorative Circle Shape (top-right) */}
        <div
          className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10"
          style={{
            backgroundColor: 'var(--accent-primary)',
            transform: 'translate(50%, -50%)',
          }}
        />

        {/* Another decorative shape (bottom-right, subtle) */}
        <div
          className="absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-5"
          style={{
            backgroundColor: 'var(--bg-primary)',
            transform: 'translate(25%, 25%)',
          }}
        />

        {/* Content - Bottom Left */}
        {config.cover.titleVisible && (
          <div className="relative z-10 p-8 md:p-12 text-white max-w-2xl">
            <h1
              className="text-5xl md:text-6xl font-bold mb-3"
              style={{
                fontFamily: 'var(--font-heading)',
                letterSpacing: 'var(--heading-letter-spacing)',
                lineHeight: `var(--heading-line-height)`,
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="text-white/90 text-lg md:text-xl"
                style={{
                  fontFamily: 'var(--font-body)',
                  letterSpacing: 'var(--body-letter-spacing)',
                  lineHeight: `var(--body-line-height)`,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

CoverClassic.displayName = 'CoverClassic';

export default CoverClassic;
