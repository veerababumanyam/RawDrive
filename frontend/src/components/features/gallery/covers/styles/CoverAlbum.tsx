/**
 * Album Style Cover - Vinyl record album aesthetic
 * Features: Circular disc design, minimalist center label, retro feel
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverAlbum = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery', subtitle = 'Collection', config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Large vinyl record circle */}
      <div className="absolute inset-1/4 rounded-full" style={{
        background: 'radial-gradient(circle, #333, #111)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), inset 0 0 30px rgba(0, 0, 0, 0.8)',
      }} />

      {/* Record grooves effect */}
      <div className="absolute inset-1/4 rounded-full" style={{
        backgroundImage: `repeating-radial-gradient(circle, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)`,
      }} />

      {/* Center label */}
      {config.cover.titleVisible && (
        <div className="absolute inset-1/3 rounded-full flex flex-col items-center justify-center" style={{
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
        }}>
          <h1 className="text-4xl font-bold text-white text-center" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h1>
          {subtitle && <p className="text-white/90 text-sm mt-2" style={{ fontFamily: 'var(--font-body)' }}>{subtitle}</p>}
        </div>
      )}

      {/* Center spindle hole */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-8 h-8 rounded-full bg-black shadow-lg" />
      </div>
    </div>
  )
);
CoverAlbum.displayName = 'CoverAlbum';
export default CoverAlbum;
