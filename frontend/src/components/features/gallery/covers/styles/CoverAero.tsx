/**
 * Aero Premium Style - Dynamic motion with angular shapes
 * Features: Motion lines, angular chevrons, bold shapes, monochromatic scheme, speed effect
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverAero = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900">
      {/* Motion lines suggesting speed */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-40" />
        <div className="absolute top-1/3 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-30" />
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-35" />
        <div className="absolute top-2/3 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-25" />
      </div>

      {/* Angular chevron patterns pointing right */}
      <div className="absolute left-12 top-1/4" style={{ clipPath: 'polygon(0% 0%, 60% 50%, 0% 100%)', width: '60px', height: '60px', background: '#3B82F6', opacity: 0.3 }} />
      <div className="absolute left-24 top-1/3" style={{ clipPath: 'polygon(0% 0%, 60% 50%, 0% 100%)', width: '80px', height: '80px', background: '#0EA5E9', opacity: 0.25 }} />
      <div className="absolute right-12 bottom-1/4" style={{ clipPath: 'polygon(40% 0%, 100% 50%, 40% 100%)', width: '70px', height: '70px', background: '#06B6D4', opacity: 0.2 }} />

      {/* Grid effect */}
      <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(59,130,246,0.08) 1px, rgba(59,130,246,0.08) 2px), repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(59,130,246,0.08) 1px, rgba(59,130,246,0.08) 2px)' }} />

      {/* Title centered */}
      {config.cover.titleVisible && (
        <div className="relative z-20 text-center">
          <div className="backdrop-blur-sm bg-black/30 px-12 py-6 rounded-lg border border-cyan-400/30">
            <h1 className="text-6xl font-bold tracking-wider text-white" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '0.1em' }}>AERO</h1>
            <div className="h-1 w-32 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 mx-auto mt-2" />
            <p className="text-xs text-cyan-300 mt-3 tracking-widest">DYNAMIC MOTION</p>
          </div>
        </div>
      )}
    </div>
  )
);
CoverAero.displayName = 'CoverAero';
export default CoverAero;
