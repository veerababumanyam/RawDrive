/**
 * Edge Premium Cover - Minimalist boundary aesthetic
 *
 * Features:
 * - Sharp geometric edge design
 * - Gradient split with clean line division
 * - Minimalist typography with high contrast
 * - Modern, contemporary composition
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverEdgeProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverEdge = React.forwardRef<HTMLDivElement, CoverEdgeProps>(
  ({ title = 'Gallery Title', subtitle = 'Your Vision', config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full relative flex items-center justify-center overflow-hidden"
      >
        {/* Left gradient half */}
        <div
          className="absolute inset-0 w-1/2 left-0"
          style={{
            background: `linear-gradient(135deg, #1F2937 0%, #111827 100%)`,
          }}
        />

        {/* Right gradient half */}
        <div
          className="absolute inset-0 w-1/2 right-0"
          style={{
            background: `linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)`,
          }}
        />

        {/* Center sharp dividing line */}
        <div
          className="absolute inset-0 w-1 left-1/2 transform -translate-x-1/2"
          style={{
            background: 'var(--accent-primary)',
            boxShadow: `0 0 20px var(--accent-primary)`,
          }}
        />

        {/* Content */}
        {config.cover.titleVisible && (
          <div className="relative z-10 text-center px-12 max-w-2xl">
            <h1
              className="text-6xl font-bold mb-2"
              style={{
                fontFamily: 'var(--font-heading)',
                letterSpacing: '0.05em',
                lineHeight: `var(--heading-line-height)`,
                color: '#FFFFFF',
              }}
            >
              {title}
            </h1>

            {subtitle && (
              <p
                className="text-lg"
                style={{
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '0.1em',
                  color: '#1F2937',
                  textTransform: 'uppercase',
                  fontSize: '0.875rem',
                }}
              >
                {subtitle}
              </p>
            )}

            {/* Geometric accent bars */}
            <div className="mt-6 flex justify-center gap-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-1"
                  style={{
                    width: i === 2 ? '24px' : '16px',
                    backgroundColor: 'var(--accent-primary)',
                    opacity: 1 - i * 0.15,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

CoverEdge.displayName = 'CoverEdge';
export default CoverEdge;
