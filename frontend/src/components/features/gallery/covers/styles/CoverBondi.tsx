/**
 * Bondi Premium Style - Beach sunburst with horizon line
 * Features: Sunburst ray pattern, beach gradient, horizon line, golden lighting
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverBondi = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-sky-400 via-cyan-300 to-blue-400">
      {/* Sunburst ray pattern from top-left corner */}
      <svg className="absolute top-0 left-0 w-full h-full" style={{ opacity: 0.4 }} preserveAspectRatio="none" viewBox="0 0 1200 800">
        <defs>
          <linearGradient id="sunburstGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(251,191,36,0.6)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0)" />
          </linearGradient>
        </defs>
        {/* Sunburst rays */}
        <line x1="0" y1="0" x2="400" y2="600" stroke="url(#sunburstGrad)" strokeWidth="3" opacity="0.5" />
        <line x1="0" y1="0" x2="600" y2="200" stroke="url(#sunburstGrad)" strokeWidth="3" opacity="0.5" />
        <line x1="0" y1="0" x2="200" y2="400" stroke="url(#sunburstGrad)" strokeWidth="2" opacity="0.4" />
        <line x1="0" y1="0" x2="500" y2="150" stroke="url(#sunburstGrad)" strokeWidth="2" opacity="0.4" />
        <line x1="0" y1="0" x2="300" y2="500" stroke="url(#sunburstGrad)" strokeWidth="2" opacity="0.4" />
      </svg>

      {/* Golden lighting overlay on upper portion */}
      <div className="absolute top-0 left-0 w-full h-2/3 bg-gradient-to-b from-yellow-100 to-transparent opacity-20" />

      {/* Horizon line dividing composition */}
      <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-50" style={{ boxShadow: '0 2px 8px rgba(251,191,36,0.3)' }} />

      {/* Beach sand gradient at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-2/5 bg-gradient-to-t from-yellow-300 via-yellow-200 to-transparent opacity-70" />

      {/* Ocean water layer in middle */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-400 to-blue-500 opacity-30" />

      {/* Title positioned above horizon */}
      {config.cover.titleVisible && (
        <div className="relative z-20 text-center mb-20">
          <div className="backdrop-blur-sm bg-white/30 px-12 py-6 rounded-lg border border-yellow-300/40">
            <h1 className="text-6xl font-bold text-amber-900 mb-2" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 2px 8px rgba(255,255,255,0.6)' }}>Bondi</h1>
            <div className="h-1 w-20 bg-gradient-to-r from-yellow-500 to-orange-400 mx-auto" />
            <p className="text-sm text-amber-800 mt-2 tracking-wide font-semibold">Beach Paradise</p>
          </div>
        </div>
      )}
    </div>
  )
);
CoverBondi.displayName = 'CoverBondi';
export default CoverBondi;
