/**
 * Breeze Premium Style - Light and airy design
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverBreeze = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-cyan-100 via-blue-100 to-sky-100">
      <div className="absolute top-0 right-0 w-1/2 h-1/2 rounded-full" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.1), transparent)' }} />
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-blue-900 px-8">
          <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Breeze</h1>
          <p className="text-lg text-blue-700 mt-2">Fresh & Light</p>
        </div>
      )}
    </div>
  )
);
CoverBreeze.displayName = 'CoverBreeze';
export default CoverBreeze;
