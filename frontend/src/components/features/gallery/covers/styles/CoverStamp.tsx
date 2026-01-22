/**
 * Stamp Style Cover - Postage stamp aesthetic
 * Features: Rotated text, perforated edge effect, vintage postal feel
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverStamp = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery', subtitle = 'Collection', config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-red-50 to-red-100">
      {/* Background decorative pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(0,0,0,0.1) 20px, rgba(0,0,0,0.1) 40px)`,
      }} />

      {/* Main stamp element */}
      <div className="relative z-10" style={{
        width: '280px',
        height: '280px',
        border: '3px dashed rgba(200, 50, 50, 0.4)',
        borderRadius: '8px',
        background: 'linear-gradient(135deg, #FFF9E6 0%, #FFEDCC 100%)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'rotate(-15deg)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      }}>
        {config.cover.titleVisible && (
          <>
            <h1 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '28px',
              fontWeight: 'bold',
              color: '#C43232',
              textAlign: 'center',
              transform: 'rotate(0deg)',
              margin: 0,
            }}>{title}</h1>
            {subtitle && <p style={{ fontSize: '14px', color: '#D97373', margin: '4px 0 0 0' }}>{subtitle}</p>}
          </>
        )}
      </div>
    </div>
  )
);
CoverStamp.displayName = 'CoverStamp';
export default CoverStamp;
