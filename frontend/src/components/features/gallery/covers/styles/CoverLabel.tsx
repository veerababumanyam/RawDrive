/**
 * Label Style Cover - Tag/label aesthetic with colored band
 * Features: Horizontal colored band, label-like appearance, modern tag design
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverLabel = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery Title', subtitle = 'New Collection', config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden bg-white">
      {/* Top decoration */}
      <div className="absolute top-12 w-full h-1 bg-gradient-to-r from-transparent via-accent-primary to-transparent" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)' }} />

      {/* Main label band */}
      <div className="relative z-10 px-8 py-6 text-center" style={{
        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
        minWidth: '70%',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      }}>
        {config.cover.titleVisible && (
          <>
            <h1 className="text-5xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h1>
            {subtitle && <p className="text-white/90 text-lg" style={{ fontFamily: 'var(--font-body)' }}>{subtitle}</p>}
          </>
        )}
      </div>

      {/* Bottom decoration */}
      <div className="absolute bottom-12 w-full h-1 bg-gradient-to-r from-transparent via-accent-secondary to-transparent" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-secondary), transparent)' }} />
    </div>
  )
);
CoverLabel.displayName = 'CoverLabel';
export default CoverLabel;
