/**
 * Stripe Style Cover - Bold color blocking with horizontal stripes
 * Features: Modern color palette, geometric stripes, high contrast
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverStripe = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery Title', subtitle = 'Your Story', config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex flex-col overflow-hidden">
      <div className="flex-1 bg-gradient-to-b from-blue-600 to-blue-500" />
      <div className="flex-1 bg-gradient-to-b from-indigo-600 to-indigo-500" />
      <div className="flex-1 bg-gradient-to-b from-purple-600 to-purple-500" />

      {config.cover.titleVisible && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-8">
          <h1 className="text-6xl font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', textShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>{title}</h1>
          {subtitle && <p className="text-lg" style={{ fontFamily: 'var(--font-body)', textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{subtitle}</p>}
        </div>
      )}
    </div>
  )
);
CoverStripe.displayName = 'CoverStripe';
export default CoverStripe;
