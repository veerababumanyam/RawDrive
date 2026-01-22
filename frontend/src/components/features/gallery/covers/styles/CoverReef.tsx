/**
 * Reef Premium Style - Coral reef inspired
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';
interface Props { config: GalleryDesignConfig; [key: string]: any; }
export const CoverReef = React.forwardRef<HTMLDivElement, Props>(
  ({ config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-orange-400 via-red-400 to-pink-500">
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)' }} />
      {config.cover.titleVisible && (
        <div className="relative z-10 text-center text-white px-8">
          <h1 className="text-6xl font-bold" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>Reef</h1>
          <p className="text-lg text-orange-100 mt-2">Vibrant & Alive</p>
        </div>
      )}
    </div>
  )
);
CoverReef.displayName = 'CoverReef';
export default CoverReef;
