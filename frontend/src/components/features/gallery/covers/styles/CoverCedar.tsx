/**
 * Cedar Premium Style - Warm wood-inspired design
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverCedar = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #8B4513, #A0522D, #8B4513)' }}>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)' }} />
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-yellow-50 px-8">
          <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>Cedar</h1>
          <p className="text-lg text-yellow-100 mt-2">Warm & Natural</p>
        </div>
      )}
    </div>
  )
);
CoverCedar.displayName = 'CoverCedar';
export default CoverCedar;
