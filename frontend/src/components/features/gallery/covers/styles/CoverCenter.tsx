/**
 * Center Style Cover
 *
 * Features:
 * - Centered text layout
 * - Background gradient with focal point positioning
 * - Semi-transparent overlay
 * - Main title + subtitle
 * - Responsive text sizing
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverCenterProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverCenter = React.forwardRef<HTMLDivElement, CoverCenterProps>(
  ({ title = 'Gallery Title', subtitle = 'Your wedding story', coverImageUrl, focalPoint, overlayOpacity, config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full relative flex items-center justify-center overflow-hidden"
      >
        {/* Background Image with Focal Point */}
        {coverImageUrl ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${coverImageUrl})`,
              backgroundPosition: `${focalPoint.x}% ${focalPoint.y}%`,
              backgroundSize: 'cover',
              backgroundAttachment: 'fixed',
            }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)`,
            }}
          />
        )}

        {/* Overlay */}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: 'var(--bg-primary)',
            opacity: overlayOpacity,
          }}
        />

        {/* Content - Centered */}
        {config.cover.titleVisible && (
          <div className="relative z-10 text-center px-4 max-w-2xl">
            <h1
              className="text-5xl md:text-6xl font-bold text-white"
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
                className="text-white/80 mt-4 text-lg md:text-xl"
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

CoverCenter.displayName = 'CoverCenter';

export default CoverCenter;
