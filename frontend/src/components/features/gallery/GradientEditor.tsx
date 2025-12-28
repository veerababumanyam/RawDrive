/**
 * GradientEditor Component
 * Full editor for creating and modifying custom gradients.
 * Combines ColorStopEditor and DirectionSlider with live preview.
 *
 * Features:
 * - Live gradient preview as changes are made
 * - Color stop editor (add/remove/edit colors and positions)
 * - Direction slider for gradient angle
 * - Reset button to revert to original state
 * - Apply button to confirm changes
 * - Contrast warning display
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Palette, RotateCcw, Check, X, AlertTriangle } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { ColorStopEditor } from './ColorStopEditor';
import { DirectionSlider } from './DirectionSlider';
import { gradientToCss, checkGradientContrast } from '../../../utils/gradientUtils';
import type { GradientConfiguration, ColorStop } from '../../../types/gradient';

export interface GradientEditorProps {
  /** Initial gradient configuration */
  initialGradient: GradientConfiguration;
  /** Callback when Apply is clicked */
  onApply: (gradient: GradientConfiguration) => void;
  /** Callback when Cancel is clicked */
  onCancel: () => void;
  /** Optional className */
  className?: string;
}

export const GradientEditor: React.FC<GradientEditorProps> = ({
  initialGradient,
  onApply,
  onCancel,
  className = '',
}) => {
  // Local state for editing
  const [colors, setColors] = useState<ColorStop[]>(initialGradient.colors);
  const [direction, setDirection] = useState<number>(initialGradient.direction);

  // Build current gradient config from state
  const currentGradient = useMemo<GradientConfiguration>(
    () => ({
      type: 'linear',
      preset_id: null, // Custom gradient has no preset_id
      direction,
      colors,
    }),
    [colors, direction]
  );

  // Generate CSS for preview
  const gradientCss = useMemo(() => gradientToCss(currentGradient), [currentGradient]);

  // Check contrast
  const contrastResult = useMemo(
    () => checkGradientContrast(currentGradient, '#FFFFFF'),
    [currentGradient]
  );

  // Check if anything has changed from initial
  const hasChanges = useMemo(() => {
    if (direction !== initialGradient.direction) return true;
    if (colors.length !== initialGradient.colors.length) return true;
    return colors.some(
      (stop, i) =>
        stop.color !== initialGradient.colors[i]?.color ||
        stop.position !== initialGradient.colors[i]?.position
    );
  }, [colors, direction, initialGradient]);

  const handleReset = useCallback(() => {
    setColors(initialGradient.colors);
    setDirection(initialGradient.direction);
  }, [initialGradient]);

  const handleApply = useCallback(() => {
    onApply(currentGradient);
  }, [currentGradient, onApply]);

  return (
    <div className={`bg-surface border border-border rounded-xl shadow-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Palette size={20} className="text-accent" />
          <h3 className="font-semibold text-text-primary">Custom Gradient</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded"
          aria-label="Close editor"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Large Preview */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">Preview</label>
          <div
            className="h-32 rounded-lg border border-border overflow-hidden transition-all duration-300"
            style={{ background: gradientCss }}
          >
            {/* Sample text overlay */}
            <div className="h-full flex flex-col items-center justify-center text-white drop-shadow-md">
              <span className="text-xl font-semibold">Gallery Title</span>
              <span className="text-sm opacity-80">Preview with white text</span>
            </div>
          </div>

          {/* Contrast warning */}
          {!contrastResult.passes && (
            <div className="flex items-center gap-2 p-2 bg-warning/10 border border-warning/20 rounded-lg text-sm">
              <AlertTriangle size={16} className="text-warning flex-shrink-0" />
              <div>
                <span className="font-medium text-warning">
                  Low contrast ({contrastResult.minRatio.toFixed(1)}:1)
                </span>
                {contrastResult.recommendation && (
                  <span className="text-text-secondary ml-1">
                    - {contrastResult.recommendation}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Direction Slider */}
        <DirectionSlider value={direction} onChange={setDirection} />

        {/* Color Stops */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">Color Stops</label>
          <ColorStopEditor stops={colors} onChange={setColors} minStops={2} maxStops={5} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-4 border-t border-border bg-surface-hover rounded-b-xl">
        <AppButton
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={!hasChanges}
          className="text-text-secondary"
        >
          <RotateCcw size={16} className="mr-2" />
          Reset
        </AppButton>

        <div className="flex items-center gap-2">
          <AppButton variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={!hasChanges}
          >
            <Check size={16} className="mr-2" />
            Apply
          </AppButton>
        </div>
      </div>
    </div>
  );
};

export default GradientEditor;
