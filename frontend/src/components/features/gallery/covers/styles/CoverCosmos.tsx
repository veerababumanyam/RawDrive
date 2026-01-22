/**
 * Cosmos Premium Style - Space and stars inspired
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverCosmos = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950">
      {[...Array(30)].map((_, i) => <div key={i} className="absolute rounded-full" style={{ width: Math.random() * 3 + 'px', height: Math.random() * 3 + 'px', backgroundColor: 'rgba(255,255,255,' + (Math.random() * 0.7 + 0.3) + ')', left: Math.random() * 100 + '%', top: Math.random() * 100 + '%' }} />)}
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-white px-8">
          <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Cosmos</h1>
          <p className="text-lg text-purple-200 mt-2">Infinite Beauty</p>
        </div>
      )}
    </div>
  )
);
CoverCosmos.displayName = 'CoverCosmos';
export default CoverCosmos;
