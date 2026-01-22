/**
 * Bondi Premium Style - Beach town inspired
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverBondi = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-cyan-300 via-blue-300 to-emerald-300">
      <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-yellow-200 to-transparent opacity-60" />
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-blue-900 px-8">
          <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Bondi</h1>
          <p className="text-lg text-blue-800 mt-2">Beach Paradise</p>
        </div>
      )}
    </div>
  )
);
CoverBondi.displayName = 'CoverBondi';
export default CoverBondi;
