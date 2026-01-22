/**
 * Aero Premium Style - Sleek futuristic design
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverAero = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(168,85,247,0.1) 1px, rgba(168,85,247,0.1) 2px)' }} />
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-white px-8">
          <h1 className="text-6xl font-bold tracking-wider" style={{ fontFamily: 'var(--font-heading)' }}>AERO</h1>
          <p className="text-lg text-purple-200 mt-2 tracking-widest text-xs">FUTURISTIC</p>
        </div>
      )}
    </div>
  )
);
CoverAero.displayName = 'CoverAero';
export default CoverAero;
