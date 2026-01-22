/**
 * Anchor Premium Cover - Nautical maritime aesthetic
 *
 * Features:
 * - Ocean-inspired gradient (navy to turquoise)
 * - Anchor symbol and rope texture
 * - Weathered maritime design
 * - Adventurous, exploration theme
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverAnchorProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverAnchor = React.forwardRef<HTMLDivElement, CoverAnchorProps>(
  ({ title = 'Gallery Title', subtitle = 'Adventure Awaits', config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full relative flex items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #1B4965 100%)`,
        }}
      >
        {/* Ocean wave pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 20px,
              rgba(255, 255, 255, 0.1) 20px,
              rgba(255, 255, 255, 0.1) 40px
            )`,
          }}
        />

        {/* Large anchor symbol (background) */}
        <div
          className="absolute top-1/4 left-1/2 transform -translate-x-1/2 opacity-5"
          style={{
            width: '300px',
            height: '300px',
            fontSize: '250px',
            color: 'white',
            textAlign: 'center',
            lineHeight: '300px',
          }}
        >
          ⚓
        </div>

        {/* Rope texture overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 10px,
              rgba(255, 255, 255, 0.1) 10px,
              rgba(255, 255, 255, 0.1) 20px
            )`,
          }}
        />

        {/* Content */}
        {config.cover.titleVisible && (
          <div className="relative z-10 text-center px-12 max-w-2xl">
            {/* Decorative rope line */}
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-1 border-t-2 border-dashed" style={{ borderColor: 'var(--accent-primary)' }} />
            </div>

            <h1
              className="text-6xl font-bold text-cyan-50 mb-3"
              style={{
                fontFamily: 'var(--font-heading)',
                letterSpacing: 'var(--heading-letter-spacing)',
                lineHeight: `var(--heading-line-height)`,
                textShadow: '2px 2px 8px rgba(0, 0, 0, 0.5)',
              }}
            >
              {title}
            </h1>

            {subtitle && (
              <p
                className="text-cyan-100/80 text-lg"
                style={{
                  fontFamily: 'var(--font-body)',
                  letterSpacing: 'var(--body-letter-spacing)',
                  lineHeight: `var(--body-line-height)`,
                }}
              >
                {subtitle}
              </p>
            )}

            {/* Small anchor accents */}
            <div className="mt-6 flex justify-center gap-4">
              <span style={{ color: 'var(--accent-primary)', fontSize: '20px' }}>⚓</span>
              <span style={{ color: 'var(--accent-primary)', fontSize: '20px' }}>⚓</span>
              <span style={{ color: 'var(--accent-primary)', fontSize: '20px' }}>⚓</span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

CoverAnchor.displayName = 'CoverAnchor';
export default CoverAnchor;
