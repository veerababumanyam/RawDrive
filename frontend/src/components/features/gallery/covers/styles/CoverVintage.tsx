/**
 * Vintage Style Cover (Text)
 *
 * Features:
 * - Retro aesthetic with warm sepia/vintage overlay
 * - Decorative border frame
 * - Centered text with period typography
 * - Film grain texture overlay
 * - Classic polaroid-inspired design
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverVintageProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverVintage = React.forwardRef<HTMLDivElement, CoverVintageProps>(
  ({ title = 'Gallery Title', subtitle = 'Your Story', config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full relative flex items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, #D4A574 0%, #8B7355 100%)`,
        }}
      >
        {/* Film grain texture */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 1px,
              rgba(0, 0, 0, 0.15) 1px,
              rgba(0, 0, 0, 0.15) 2px
            )`,
          }}
        />

        {/* Decorative border frame */}
        <div className="absolute inset-8 border-8 border-amber-900/30" />
        <div className="absolute inset-12 border-2 border-amber-900/50" />

        {/* Inner content container */}
        {config.cover.titleVisible && (
          <div className="relative z-10 text-center px-8 max-w-xl">
            {/* Decorative top element */}
            <div className="mb-4 flex justify-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: 'rgba(139, 115, 85, 0.4)' }}
                />
              ))}
            </div>

            <h1
              className="text-5xl font-bold text-amber-950 mb-2"
              style={{
                fontFamily: 'var(--font-heading)',
                letterSpacing: 'var(--heading-letter-spacing)',
                lineHeight: `var(--heading-line-height)`,
                textShadow: '2px 2px 4px rgba(0, 0, 0, 0.1)',
              }}
            >
              {title}
            </h1>

            {subtitle && (
              <p
                className="text-amber-900 text-lg mt-3 italic"
                style={{
                  fontFamily: 'var(--font-body)',
                  letterSpacing: 'var(--body-letter-spacing)',
                }}
              >
                {subtitle}
              </p>
            )}

            {/* Decorative bottom element */}
            <div className="mt-4 flex justify-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: 'rgba(139, 115, 85, 0.4)' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

CoverVintage.displayName = 'CoverVintage';
export default CoverVintage;
