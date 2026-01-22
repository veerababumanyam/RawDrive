/**
 * Split Style Cover - Two-tone split screen design
 * Features: Diagonal split, contrasting colors, dynamic composition
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverSplit = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery Title', subtitle = 'Two-Tone Design', config }, ref) => (
    <div ref={ref} className="w-full h-full relative flex overflow-hidden">
      {/* Left half - accent color */}
      <div className="flex-1" style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }} />
      {/* Right half - light background */}
      <div className="flex-1 bg-gradient-to-br from-slate-50 to-slate-100" />

      {config.cover.titleVisible && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
          <h1 className="text-6xl font-bold mb-3" style={{
            fontFamily: 'var(--font-heading)',
            background: 'linear-gradient(90deg, white, var(--text-primary))',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>{title}</h1>
          {subtitle && <p className="text-lg text-slate-600" style={{ fontFamily: 'var(--font-body)' }}>{subtitle}</p>}
        </div>
      )}
    </div>
  )
);
CoverSplit.displayName = 'CoverSplit';
export default CoverSplit;
