/**
 * Breeze Premium Style - Soft cloud shapes with floating panels
 * Features: Cloud-like shapes, pastel gradients, floating text panels, gentle blur effects
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverBreeze = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-cyan-100 via-blue-50 to-sky-100">
      {/* Floating cloud shapes */}
      <div className="absolute top-12 left-16 w-32 h-20 rounded-full" style={{ background: 'radial-gradient(ellipse 60px 40px at 50% 50%, rgba(255,255,255,0.8), transparent)', filter: 'blur(8px)' }} />
      <div className="absolute top-1/3 right-20 w-40 h-24 rounded-full" style={{ background: 'radial-gradient(ellipse 80px 50px at 50% 50%, rgba(255,255,255,0.7), transparent)', filter: 'blur(10px)' }} />
      <div className="absolute bottom-1/4 left-1/4 w-36 h-22 rounded-full" style={{ background: 'radial-gradient(ellipse 70px 45px at 50% 50%, rgba(191,219,254,0.6), transparent)', filter: 'blur(12px)' }} />
      <div className="absolute bottom-12 right-12 w-44 h-28 rounded-full" style={{ background: 'radial-gradient(ellipse 90px 60px at 50% 50%, rgba(255,255,255,0.65), transparent)', filter: 'blur(9px)' }} />

      {/* Pastel gradient background elements */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 rounded-full" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.12), transparent)' }} />
      <div className="absolute bottom-0 left-0 w-1/3 h-1/3" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08), transparent)', borderRadius: '50%' }} />

      {/* Floating title panel */}
      {config.cover.titleVisible && (
        <div className="relative z-20">
          <div className="backdrop-blur-md bg-white/40 px-12 py-8 rounded-2xl border border-white/30 shadow-2xl" style={{ boxShadow: '0 8px 32px rgba(31, 41, 55, 0.1)' }}>
            <h1 className="text-6xl font-bold text-blue-900 mb-2" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '0.02em' }}>Breeze</h1>
            <div className="h-1 w-16 bg-gradient-to-r from-cyan-300 to-blue-300 mx-auto" />
            <p className="text-sm text-blue-700 mt-3 tracking-wide">Soft & Ethereal</p>
          </div>
        </div>
      )}
    </div>
  )
);
CoverBreeze.displayName = 'CoverBreeze';
export default CoverBreeze;
