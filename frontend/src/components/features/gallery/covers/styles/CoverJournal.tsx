/**
 * Journal Style Cover - Ruled paper aesthetic
 * Features: Lined paper background, handwritten feel, intimate
 */
import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface Props { title?: string; subtitle?: string; config: GalleryDesignConfig; [key: string]: any; }

export const CoverJournal = React.forwardRef<HTMLDivElement, Props>(
  ({ title = 'Gallery Title', subtitle = 'A Personal Journey', config }, ref) => (
    <div ref={ref} className="w-full h-full relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #FFFBF0 0%, #FFF8E7 100%)' }}>
      {/* Ruled lines */}
      <div className="absolute inset-0" style={{
        backgroundImage: `repeating-linear-gradient(0deg, #E8D7C3 0px, #E8D7C3 1px, transparent 1px, transparent 32px)`,
        backgroundPosition: '0 24px',
      }} />
      {/* Left margin */}
      <div className="absolute left-0 top-0 bottom-0 w-16 border-r-2" style={{ borderColor: '#D4A574' }} />

      {config.cover.titleVisible && (
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-12 pt-12 text-center">
          <h1 className="text-5xl font-semibold mb-3" style={{ fontFamily: 'var(--font-heading)', color: '#6B4423', fontStyle: 'italic' }}>{title}</h1>
          {subtitle && <p className="text-lg" style={{ fontFamily: 'var(--font-body)', color: '#8B6F47' }}>{subtitle}</p>}
        </div>
      )}
    </div>
  )
);
CoverJournal.displayName = 'CoverJournal';
export default CoverJournal;
