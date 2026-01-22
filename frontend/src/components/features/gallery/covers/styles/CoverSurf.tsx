/**
 * Surf Premium Style - Ocean wave inspired
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverSurf = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-blue-400 to-teal-600">
      <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(180deg, transparent, transparent 20px, rgba(255,255,255,0.05) 20px, rgba(255,255,255,0.05) 40px)' }} />
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-white px-8">
          <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>Surf</h1>
          <p className="text-lg text-blue-100 mt-2">Waves & Tides</p>
        </div>
      )}
    </div>
  )
);
CoverSurf.displayName = 'CoverSurf';
export default CoverSurf;
