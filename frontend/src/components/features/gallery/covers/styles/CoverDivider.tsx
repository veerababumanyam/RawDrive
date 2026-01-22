/**
 * Divider Style Cover - Centered line divider aesthetic
 * Features: Minimalist with centered dividing line, balanced composition
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverDivider = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery Title', subtitle = 'Your Story', config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-white">
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1 bg-gradient-to-b from-slate-100 to-white" />
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)' }} />
        <div className="flex-1 bg-gradient-to-b from-white to-slate-50" />
      </div>

      {config.cover.titleVisible && (
        <div className="relative z-10 text-center px-8 max-w-2xl">
          <h1 className="text-6xl font-bold mb-4" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>{title}</h1>
          {subtitle && <p className="text-lg" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>{subtitle}</p>}
        </div>
      )}
    </div>
  )
);
CoverDivider.displayName = 'CoverDivider';
export default CoverDivider;
