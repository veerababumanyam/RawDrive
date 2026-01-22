/**
 * West Premium Style - Western rustic with geometric borders
 * Features: Diamond border patterns, rustic palette, distressed texture, strong horizontal orientation
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverWest = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-orange-700 via-red-700 to-amber-950">
      {/* Rustic gradient underlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-orange-800 via-red-900 to-amber-900 opacity-80" />

      {/* Distressed texture overlay - subtle noise effect */}
      <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)', opacity: 0.6 }} />

      {/* Geometric diamond border pattern - top */}
      <svg className="absolute top-0 left-0 right-0 w-full h-16" style={{ opacity: 0.8 }} preserveAspectRatio="none" viewBox="0 0 1200 100">
        <defs>
          <linearGradient id="diamondGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#a16207" />
          </linearGradient>
        </defs>
        {/* Diamond pattern repeating */}
        <polygon points="50,10 90,50 50,90 10,50" fill="url(#diamondGrad1)" opacity="0.7" />
        <polygon points="200,10 240,50 200,90 160,50" fill="url(#diamondGrad1)" opacity="0.7" />
        <polygon points="350,10 390,50 350,90 310,50" fill="url(#diamondGrad1)" opacity="0.7" />
        <polygon points="500,10 540,50 500,90 460,50" fill="url(#diamondGrad1)" opacity="0.7" />
        <polygon points="650,10 690,50 650,90 610,50" fill="url(#diamondGrad1)" opacity="0.7" />
        <polygon points="800,10 840,50 800,90 760,50" fill="url(#diamondGrad1)" opacity="0.7" />
        <polygon points="950,10 990,50 950,90 910,50" fill="url(#diamondGrad1)" opacity="0.7" />
        <polygon points="1100,10 1140,50 1100,90 1060,50" fill="url(#diamondGrad1)" opacity="0.7" />
      </svg>

      {/* Geometric diamond border pattern - bottom */}
      <svg className="absolute bottom-0 left-0 right-0 w-full h-16" style={{ opacity: 0.8 }} preserveAspectRatio="none" viewBox="0 0 1200 100">
        <defs>
          <linearGradient id="diamondGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a16207" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
        {/* Diamond pattern repeating */}
        <polygon points="50,50 90,10 130,50 90,90" fill="url(#diamondGrad2)" opacity="0.7" />
        <polygon points="200,50 240,10 280,50 240,90" fill="url(#diamondGrad2)" opacity="0.7" />
        <polygon points="350,50 390,10 430,50 390,90" fill="url(#diamondGrad2)" opacity="0.7" />
        <polygon points="500,50 540,10 580,50 540,90" fill="url(#diamondGrad2)" opacity="0.7" />
        <polygon points="650,50 690,10 730,50 690,90" fill="url(#diamondGrad2)" opacity="0.7" />
        <polygon points="800,50 840,10 880,50 840,90" fill="url(#diamondGrad2)" opacity="0.7" />
        <polygon points="950,50 990,10 1030,50 990,90" fill="url(#diamondGrad2)" opacity="0.7" />
        <polygon points="1100,50 1140,10 1180,50 1140,90" fill="url(#diamondGrad2)" opacity="0.7" />
      </svg>

      {/* Title with strong horizontal orientation */}
      {config.cover.titleVisible && (
        <div className="relative z-20 text-center">
          <div className="backdrop-blur-sm bg-black/40 px-16 py-8 rounded-sm border-l-4 border-r-4 border-yellow-600" style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}>
            <h1 className="text-7xl font-black text-yellow-100 tracking-widest mb-3" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.6)', letterSpacing: '0.15em' }}>WEST</h1>
            <div className="h-1 w-32 bg-gradient-to-r from-yellow-600 via-orange-500 to-yellow-600 mx-auto" />
            <p className="text-sm text-yellow-200 mt-3 tracking-widest font-semibold">DESERT DREAMS</p>
          </div>
        </div>
      )}
    </div>
  )
);
CoverWest.displayName = 'CoverWest';
export default CoverWest;
