/**
 * West Premium Style - Desert sunset inspired
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverWest = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-orange-600 via-red-500 to-amber-900">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(180deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)' }} />
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-yellow-50 px-8">
          <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>West</h1>
          <p className="text-lg text-orange-100 mt-2">Desert Dreams</p>
        </div>
      )}
    </div>
  )
);
CoverWest.displayName = 'CoverWest';
export default CoverWest;
