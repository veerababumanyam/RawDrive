/**
 * Cedar Premium Style - Organic wood grain texture with natural elements
 * Features: Wood grain patterns, leaf elements, earthy palette, vignette framing
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverCedar = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #78704C, #8B7355, #6B5447)' }}>
      {/* Wood grain texture overlay */}
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 4px), repeating-linear-gradient(180deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 6px)' }} />

      {/* Additional wood texture with subtle curves */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 400px 600px at 20% 30%, rgba(139,69,19,0.15), transparent 70%), radial-gradient(ellipse 300px 400px at 80% 60%, rgba(91,58,31,0.15), transparent 70%)' }} />

      {/* Decorative leaf elements - left side */}
      <div className="absolute top-10 left-10 w-20 h-20 opacity-30" style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', background: '#5A7C3E' }} />
      <div className="absolute bottom-20 right-12 w-24 h-16 opacity-25" style={{ clipPath: 'polygon(50% 0%, 100% 30%, 100% 100%, 0% 100%, 0% 30%)', background: '#6B8E3E' }} />

      {/* Vignette effect */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)' }} />

      {/* Title with natural framing */}
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-yellow-50 px-8">
          <div className="backdrop-blur-sm bg-black/20 px-10 py-8 rounded-lg border border-yellow-100/20">
            <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.6)', letterSpacing: '0.05em' }}>Cedar</h1>
            <div className="h-1 w-16 bg-gradient-to-r from-green-700 to-yellow-700 mx-auto mt-3" />
            <p className="text-sm text-yellow-100 mt-3 tracking-wide">Natural Aesthetic</p>
          </div>
        </div>
      )}
    </div>
  )
);
CoverCedar.displayName = 'CoverCedar';
export default CoverCedar;
