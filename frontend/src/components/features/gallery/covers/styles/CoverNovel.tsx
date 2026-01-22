/**
 * Novel Style Cover (Text)
 *
 * Features:
 * - Book spine aesthetic with elegant typography
 * - Left sidebar with gradient
 * - Right content area with subtle pattern
 * - Sophisticated, literary feel
 * - Professional two-column layout
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverNovelProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverNovel = React.forwardRef<HTMLDivElement, CoverNovelProps>(
  ({ title = 'Gallery Title', subtitle = 'A Story in Photos', config }, ref) => {
    return (
      <div ref={ref} className="w-full h-full relative flex overflow-hidden">
        {/* Left Spine - Gradient Sidebar */}
        <div
          className="w-1/4 flex items-center justify-center py-12"
          style={{
            background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
          }}
        >
          {config.cover.titleVisible && (
            <div className="text-white text-center px-4 writing-vertical">
              <p
                className="text-sm tracking-widest"
                style={{
                  fontFamily: 'var(--font-body)',
                  transform: 'rotate(-90deg)',
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </p>
            </div>
          )}
        </div>

        {/* Right Content Area */}
        <div
          className="flex-1 relative flex flex-col items-center justify-center p-8"
          style={{
            background: `linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.98))`,
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.02) 2px,
              rgba(0, 0, 0, 0.02) 4px
            )`,
          }}
        >
          {config.cover.titleVisible && (
            <div className="text-center max-w-xl">
              <h1
                className="text-6xl font-light mb-4"
                style={{
                  fontFamily: 'var(--font-heading)',
                  color: 'var(--text-primary)',
                  letterSpacing: '0.05em',
                }}
              >
                {title}
              </h1>

              {subtitle && (
                <p
                  className="text-lg"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontSize: '0.875rem',
                  }}
                >
                  {subtitle}
                </p>
              )}

              {/* Decorative line */}
              <div className="mt-6 flex justify-center gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-8 h-px" style={{ backgroundColor: 'var(--accent-primary)' }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

CoverNovel.displayName = 'CoverNovel';
export default CoverNovel;
