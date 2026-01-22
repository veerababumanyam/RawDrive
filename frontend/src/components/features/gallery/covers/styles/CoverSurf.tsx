/**
 * Surf Premium Style - Layered ocean waves with foam effects
 * Features: Wave patterns, oceanic gradients, foam texture, layered composition
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverSurf = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden">
      {/* Oceanic gradient: deep blue to aqua to seafoam */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-900 via-cyan-500 to-teal-400" />

      {/* Wave patterns - SVG-style using CSS */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.6 }} preserveAspectRatio="none" viewBox="0 0 1200 300">
        <defs>
          <linearGradient id="waveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {/* Wave 1 */}
        <path d="M 0,150 Q 300,100 600,150 T 1200,150 L 1200,180 Q 900,220 600,180 T 0,180 Z" fill="url(#waveGrad)" />
        {/* Wave 2 */}
        <path d="M 0,180 Q 280,140 560,180 T 1120,180 L 1200,200 Q 900,240 600,200 T 0,200 Z" fill="rgba(255,255,255,0.15)" />
        {/* Wave 3 */}
        <path d="M 0,210 Q 300,170 600,210 T 1200,210 L 1200,240 Q 900,270 600,240 T 0,240 Z" fill="rgba(255,255,255,0.08)" />
      </svg>

      {/* Foam/splash texture overlay */}
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.2) 1px, transparent 1px), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '50px 50px, 70px 70px' }} />

      {/* Title on stable band */}
      {config.cover.titleVisible && (
        <div className="relative z-20 mt-24">
          <div className="backdrop-blur-sm bg-black/25 px-12 py-6 rounded-lg">
            <h1 className="text-6xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>Surf</h1>
            <div className="h-1 w-20 bg-gradient-to-r from-cyan-300 to-teal-300" />
            <p className="text-sm text-cyan-100 mt-2 tracking-wide">Oceanic Waves</p>
          </div>
        </div>
      )}
    </div>
  )
);
CoverSurf.displayName = 'CoverSurf';
export default CoverSurf;
