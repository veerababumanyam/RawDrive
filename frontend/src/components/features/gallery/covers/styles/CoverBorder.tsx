/**
 * Border Style Cover - Bold border frame design
 * Features: Thick colored border, centered content, framed appearance
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverBorder = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery Title', subtitle = 'Your Moments', config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Outer border */}
      <div className="absolute inset-0 border-8" style={{
        borderColor: 'var(--accent-primary)',
        borderRadius: '4px',
      }} />
      {/* Inner border */}
      <div className="absolute inset-6 border-2 rounded-sm" style={{
        borderColor: 'var(--accent-secondary)',
        opacity: 0.5,
      }} />

      {config.cover.titleVisible && (
        <div className="relative z-10 text-center px-8 max-w-xl">
          <h1 className="text-6xl font-bold mb-3" style={{
            fontFamily: 'var(--font-heading)',
            color: 'var(--text-primary)',
          }}>{title}</h1>
          {subtitle && <p className="text-lg" style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--text-secondary)',
          }}>{subtitle}</p>}
        </div>
      )}
    </div>
  )
);
CoverBorder.displayName = 'CoverBorder';
export default CoverBorder;
