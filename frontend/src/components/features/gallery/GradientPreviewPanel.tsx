/**
 * GradientPreviewPanel Component
 * Shows a live preview of the selected gradient in a gallery-like context.
 * Used in VisualIdentitySettings to preview how the gradient will look.
 *
 * Features:
 * - Displays gradient as a hero/header mockup
 * - Shows sample white text to preview contrast
 * - Updates in real-time as gradient changes
 * - Shows contrast warning if text readability is poor
 * - Responsive preview sizing
 */

import React, { useMemo } from 'react';
import { AlertTriangle, Eye } from 'lucide-react';
import { gradientToCss, checkGradientContrast } from '../../../utils/gradientUtils';
import type { GradientConfiguration } from '../../../types/gradient';

export interface GradientPreviewPanelProps {
  /** The gradient configuration to preview */
  gradient: GradientConfiguration | null;
  /** Gallery name to show in preview */
  galleryName?: string;
  /** Whether to show contrast warnings */
  showContrastWarning?: boolean;
  /** Optional className for styling */
  className?: string;
}

export const GradientPreviewPanel: React.FC<GradientPreviewPanelProps> = ({
  gradient,
  galleryName = 'Gallery Name',
  showContrastWarning = true,
  className = '',
}) => {
  // Calculate gradient CSS
  const gradientStyle = useMemo(() => {
    if (!gradient) {
      return {
        background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
      };
    }
    return {
      background: gradientToCss(gradient),
    };
  }, [gradient]);

  // Check contrast with white text
  const contrastResult = useMemo(() => {
    if (!gradient) return null;
    return checkGradientContrast(gradient, '#FFFFFF');
  }, [gradient]);

  const showWarning = showContrastWarning && contrastResult && !contrastResult.passes;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Preview label */}
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Eye size={16} />
        <span className="font-medium">Live Preview</span>
        {!gradient && (
          <span className="text-text-tertiary text-xs">(Default shown)</span>
        )}
      </div>

      {/* Preview container - mimics gallery header */}
      <div
        className="relative rounded-lg overflow-hidden shadow-card"
        style={{ aspectRatio: '16/7' }}
      >
        {/* Gradient background */}
        <div
          className="absolute inset-0 transition-all duration-300"
          style={gradientStyle}
        />

        {/* Content overlay - simulates gallery header content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          {/* Mock gallery title */}
          <h3
            className="text-white font-semibold text-lg sm:text-xl text-center drop-shadow-md"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
          >
            {galleryName}
          </h3>
          {/* Mock subtitle */}
          <p
            className="text-white/80 text-sm mt-1 text-center"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
          >
            Photography Collection
          </p>
          {/* Mock navigation dots */}
          <div className="flex gap-2 mt-4">
            <div className="w-2 h-2 rounded-full bg-white/80" />
            <div className="w-2 h-2 rounded-full bg-white/40" />
            <div className="w-2 h-2 rounded-full bg-white/40" />
          </div>
        </div>

        {/* Device frame hint */}
        <div className="absolute bottom-2 right-2 text-white/50 text-xs">
          Desktop Preview
        </div>
      </div>

      {/* Contrast warning */}
      {showWarning && contrastResult && (
        <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
          <AlertTriangle size={16} className="text-warning mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-warning">
              Low text contrast ({contrastResult.minRatio.toFixed(1)}:1)
            </p>
            {contrastResult.recommendation && (
              <p className="text-text-secondary mt-0.5">
                {contrastResult.recommendation}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Accessibility note */}
      {!showWarning && gradient && (
        <p className="text-xs text-text-tertiary">
          This gradient meets accessibility guidelines for white text.
        </p>
      )}
    </div>
  );
};

export default GradientPreviewPanel;
