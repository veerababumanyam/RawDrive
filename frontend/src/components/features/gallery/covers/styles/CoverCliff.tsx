/**
 * Cliff Premium Style - Bold angular composition
 * Features: Overlapping angular panels, diagonal gradients, modern geometric depth
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverCliff = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden">
      {/* Base background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />

      {/* Overlapping angular panels with staggered positioning */}
      <div className="absolute top-0 left-0 w-1/2 h-3/4 bg-gradient-to-br from-blue-600 to-blue-800" style={{ clipPath: 'polygon(0 0, 100% 0, 70% 100%, 0 100%)' }} />
      <div className="absolute top-1/4 left-1/3 w-1/2 h-2/3 bg-gradient-to-br from-blue-500 to-cyan-600" style={{ clipPath: 'polygon(0 0, 100% 0, 80% 100%, 10% 100%)', opacity: 0.85 }} />
      <div className="absolute top-1/3 right-0 w-1/2 h-3/5 bg-gradient-to-br from-cyan-500 to-cyan-700" style={{ clipPath: 'polygon(0 10%, 100% 0, 100% 100%, 30% 100%)', opacity: 0.7 }} />

      {/* Diagonal gradient overlays at 15° angles */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(0,0,0,0.3) 70%)', opacity: 0.6 }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(75deg, rgba(59,130,246,0.2) 0%, transparent 50%)', opacity: 0.8 }} />

      {/* Decorative geometric elements */}
      <div className="absolute bottom-1/4 right-1/4 w-32 h-32 border-2 border-cyan-400/40" style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }} />

      {/* Title on horizontal bands */}
      {config.cover.titleVisible && (
        <div className="relative z-20">
          <div className="backdrop-blur-sm bg-black/30 px-12 py-6 rounded-lg">
            <h1 className="text-6xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              {config.cover.titleVisible ? 'Cliff' : ''}
            </h1>
            <div className="h-1 w-20 bg-gradient-to-r from-cyan-400 to-blue-500" />
          </div>
        </div>
      )}

      {/* Ambient light effect */}
      <div className="absolute -bottom-1/2 -right-1/4 w-full h-full rounded-full" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.15), transparent)', filter: 'blur(100px)' }} />
    </div>
  )
);
CoverCliff.displayName = 'CoverCliff';
export default CoverCliff;
