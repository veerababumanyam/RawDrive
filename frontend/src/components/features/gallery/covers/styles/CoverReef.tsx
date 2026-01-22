/**
 * Reef Premium Style - Tropical underwater with coral shapes
 * Features: Coral-inspired curves, vibrant tropical palette, underwater depth texture
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverReef = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-teal-600 via-cyan-500 to-blue-600">
      {/* Coral-inspired curved shapes */}
      <div className="absolute bottom-0 left-0 w-1/3 h-1/2" style={{ background: 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 50%, #ffa74d 100%)', clipPath: 'path("M 0,400 Q 50,300 100,350 T 200,300 L 200,500 L 0,500 Z")', opacity: 0.7 }} />
      <div className="absolute bottom-0 right-0 w-1/3 h-1/2" style={{ background: 'linear-gradient(225deg, #ff6347 0%, #ff7f50 50%, #ffa07a 100%)', clipPath: 'polygon(100% 400, 85% 250, 70% 350, 50% 280, 30% 400, 30% 500, 100% 500)', opacity: 0.65 }} />
      <div className="absolute bottom-1/4 left-1/3 w-1/4 h-1/4" style={{ background: 'radial-gradient(ellipse at center, #ff69b4 0%, #ff1493 100%)', borderRadius: '50% 50% 40% 60%', opacity: 0.6 }} />

      {/* Underwater depth texture overlay */}
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.06) 0%, transparent 50%), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)' }} />

      {/* Clear water band for text placement */}
      <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 w-3/4 h-1/4" style={{ background: 'linear-gradient(180deg, rgba(100,200,255,0.1) 0%, rgba(100,200,255,0.2) 50%, rgba(100,200,255,0.1) 100%)', backdropFilter: 'blur(8px)', borderRadius: '20px' }} />

      {/* Title centered on clear band */}
      {config.cover.titleVisible && (
        <div className="relative z-20 text-center">
          <div className="backdrop-blur-sm bg-black/25 px-12 py-6 rounded-lg border border-cyan-300/40">
            <h1 className="text-6xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>Reef</h1>
            <div className="h-1 w-20 bg-gradient-to-r from-cyan-300 to-orange-300 mx-auto" />
            <p className="text-sm text-cyan-100 mt-2 tracking-wide">Vibrant & Alive</p>
          </div>
        </div>
      )}
    </div>
  )
);
CoverReef.displayName = 'CoverReef';
export default CoverReef;
