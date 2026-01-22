/**
 * Left Style Cover
 *
 * Features:
 * - Text positioned on left side
 * - Background image on right
 * - Accent color gradient sidebar
 * - Large, bold typography
 * - Professional layout
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverLeftProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverLeft = React.forwardRef<HTMLDivElement, CoverLeftProps>(
  ({ title = 'Gallery Title', subtitle = 'Professional Photography', coverImageUrl, focalPoint, overlayOpacity, config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full relative flex items-stretch overflow-hidden"
      >
        {/* Left Panel - Text Content */}
        <div
          className="w-1/2 flex flex-col items-start justify-center p-8 md:p-12 relative z-10"
          style={{
            background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
          }}
        >
          {config.cover.titleVisible && (
            <div className="text-white max-w-lg">
              <h1
                className="text-5xl md:text-6xl font-bold mb-4"
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

        {/* Right Panel - Image */}
        <div
          className="w-1/2 relative overflow-hidden"
          style={{
            backgroundImage: coverImageUrl ? `url(${coverImageUrl})` : undefined,
            backgroundPosition: `${focalPoint.x}% ${focalPoint.y}%`,
            backgroundSize: 'cover',
          }}
        >
          {!coverImageUrl && (
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))`,
              }}
            />
          )}

          {/* Overlay on image side */}
          {coverImageUrl && (
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: 'var(--bg-primary)',
                opacity: overlayOpacity / 2,
              }}
            />
          )}
        </div>
      </div>
    );
  }
);

CoverLeft.displayName = 'CoverLeft';

export default CoverLeft;
