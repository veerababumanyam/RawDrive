/**
 * Frame Style Cover - Picture frame aesthetic
 * Features: Decorative mat frame, centered content, gallery-like presentation
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props {
  title?: string;
  subtitle?: string;
  config: GalleryDesignConfig;
  [key: string]: any;
}

export const CoverFrame = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery Title', subtitle = 'Your Collection', config }, ref) => (
    <div
      ref={ref}
      className="w-full h-full relative flex items-center justify-center p-8"
      style={{ background: `linear-gradient(135deg, #F5F1E8, #E8E3D8)` }}
    >
      {/* Outer frame */}
      <div
        className="absolute inset-0"
        style={{
          border: '48px solid rgba(153, 102, 51, 0.3)',
          boxSizing: 'border-box',
        }}
      />
      {/* Mat board */}
      <div
        className="absolute inset-12"
        style={{
          border: '32px solid rgba(153, 102, 51, 0.2)',
          boxSizing: 'border-box',
        }}
      />

      {config.cover.titleVisible && (
        <div className="relative z-10 text-center max-w-lg px-8">
          <h1
            className="text-5xl font-bold text-yellow-900 mb-2"
            style={{
              fontFamily: 'var(--font-heading)',
              letterSpacing: 'var(--heading-letter-spacing)',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="text-yellow-800 text-lg"
              style={{
                fontFamily: 'var(--font-body)',
                letterSpacing: 'var(--body-letter-spacing)',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  )
);
CoverFrame.displayName = 'CoverFrame';
export default CoverFrame;
