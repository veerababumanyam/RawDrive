/**
 * Cosmos Premium Style - Celestial space with star field and nebula effects
 * Features: Star field pattern, nebula clouds, deep space gradient, ethereal glow
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverCosmos = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden">
      {/* Deep space gradient: navy → purple → pink */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-purple-950 to-pink-950" />

      {/* Star field SVG pattern with varying sizes and opacity */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.8 }} preserveAspectRatio="none" viewBox="0 0 1600 900">
        <defs>
          <filter id="starGlow">
            <feGaussianBlur stdDeviation="0.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Large stars */}
        <circle cx="200" cy="150" r="2" fill="rgba(255,255,255,0.9)" filter="url(#starGlow)" />
        <circle cx="450" cy="200" r="2.5" fill="rgba(255,255,255,0.85)" filter="url(#starGlow)" />
        <circle cx="800" cy="100" r="2" fill="rgba(255,255,255,0.9)" filter="url(#starGlow)" />
        <circle cx="1200" cy="250" r="2" fill="rgba(255,255,255,0.9)" filter="url(#starGlow)" />
        <circle cx="1400" cy="150" r="2.5" fill="rgba(255,255,255,0.85)" filter="url(#starGlow)" />
        {/* Medium stars */}
        <circle cx="300" cy="400" r="1.5" fill="rgba(200,220,255,0.7)" filter="url(#starGlow)" />
        <circle cx="600" cy="300" r="1.5" fill="rgba(200,220,255,0.7)" filter="url(#starGlow)" />
        <circle cx="1000" cy="500" r="1.5" fill="rgba(200,220,255,0.7)" filter="url(#starGlow)" />
        <circle cx="1300" cy="600" r="1.5" fill="rgba(200,220,255,0.7)" filter="url(#starGlow)" />
        {/* Small stars scattered */}
        <circle cx="150" cy="650" r="1" fill="rgba(255,255,255,0.5)" />
        <circle cx="400" cy="700" r="1" fill="rgba(255,255,255,0.5)" />
        <circle cx="700" cy="750" r="1" fill="rgba(255,255,255,0.5)" />
        <circle cx="900" cy="650" r="1" fill="rgba(255,255,255,0.5)" />
        <circle cx="1150" cy="800" r="1" fill="rgba(255,255,255,0.5)" />
        <circle cx="1450" cy="700" r="1" fill="rgba(255,255,255,0.5)" />
      </svg>

      {/* Nebula cloud effects - low opacity blurred gradients */}
      <div className="absolute top-0 left-0 w-1/2 h-1/2" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(168,85,247,0.3) 0%, transparent 60%)', filter: 'blur(60px)', opacity: 0.6 }} />
      <div className="absolute bottom-0 right-0 w-1/2 h-1/2" style={{ background: 'radial-gradient(ellipse at 70% 60%, rgba(236,72,153,0.25) 0%, transparent 60%)', filter: 'blur(80px)', opacity: 0.5 }} />
      <div className="absolute top-1/4 right-1/4 w-1/3 h-1/3" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.2) 0%, transparent 70%)', filter: 'blur(70px)', opacity: 0.4 }} />

      {/* Title with ethereal glow effect */}
      {config.cover.titleVisible && (
        <div className="relative z-20 text-center">
          <div className="backdrop-blur-sm bg-black/20 px-12 py-6 rounded-lg border border-purple-400/30">
            <h1 className="text-6xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 0 20px rgba(168,85,247,0.6), 0 0 40px rgba(236,72,153,0.3), 0 4px 12px rgba(0,0,0,0.4)' }}>Cosmos</h1>
            <div className="h-1 w-20 bg-gradient-to-r from-purple-400 to-pink-400 mx-auto" />
            <p className="text-sm text-purple-200 mt-2 tracking-wide">Infinite Beauty</p>
          </div>
        </div>
      )}
    </div>
  )
);
CoverCosmos.displayName = 'CoverCosmos';
export default CoverCosmos;
