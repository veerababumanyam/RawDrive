/**
 * Cliff Premium Style - Bold angular composition
 * Features: Geometric angles, dramatic gradient, mountain-inspired
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverCliff = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden">
      {/* Angular background with clip-path */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800" />
      <div className="absolute -top-1/2 -right-1/4 w-full h-full rounded-full" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.2), transparent)', filter: 'blur(80px)' }} />
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-white px-8">
          <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Cliff</h1>
          <p className="text-lg text-white/80">Premium Gallery</p>
        </div>
      )}
    </div>
  )
);
CoverCliff.displayName = 'CoverCliff';
export default CoverCliff;
