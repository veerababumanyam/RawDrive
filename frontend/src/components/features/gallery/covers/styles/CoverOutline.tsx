/**
 * Outline Style Cover - Minimalist line-based design
 * Features: Simple outline elements, clean composition, modern minimalism
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverOutline = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery Title', subtitle = 'Your Collection', config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-white">
      {/* Decorative line elements */}
      <div className="absolute top-16 left-16 w-32 h-32 border-2" style={{ borderColor: 'var(--accent-primary)', opacity: 0.2 }} />
      <div className="absolute bottom-16 right-16 w-40 h-40 border-2 rounded-full" style={{ borderColor: 'var(--accent-secondary)', opacity: 0.2 }} />
      <div className="absolute top-1/2 right-1/4 w-24 h-32 border-2" style={{ borderColor: 'var(--accent-primary)', opacity: 0.15, transform: 'rotate(45deg)' }} />

      {config.cover.titleVisible && (
        <div className="relative z-10 text-center px-8 max-w-2xl">
          <h1 className="text-6xl font-light mb-4" style={{
            fontFamily: 'var(--font-heading)',
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
          }}>{title}</h1>
          {subtitle && <p className="text-lg" style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--text-secondary)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            fontSize: '0.875rem',
          }}>{subtitle}</p>}

          {/* Center accent line */}
          <div className="mt-6 flex justify-center">
            <div style={{
              width: '80px',
              height: '2px',
              background: 'var(--accent-primary)',
              opacity: 0.6,
            }} />
          </div>
        </div>
      )}
    </div>
  )
);
CoverOutline.displayName = 'CoverOutline';
export default CoverOutline;
