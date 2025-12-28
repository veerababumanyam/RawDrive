/**
 * ColorStopEditor Component
 * Allows editing color stops in a gradient with color pickers and position sliders.
 *
 * Features:
 * - Add/remove color stops (2-5 supported)
 * - Color picker for each stop
 * - Position slider (0-100%)
 * - Visual stop indicators on gradient preview bar
 * - Drag to reorder stops
 */

import React, { useCallback } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import type { ColorStop } from '../../../types/gradient';

/** Default color for newly added color stops */
const DEFAULT_NEW_STOP_COLOR = '#8B5CF6';

/** Generate a stable key for a color stop based on its properties */
const generateStopKey = (stop: ColorStop, index: number): string => {
  return `${stop.color}-${stop.position}-${index}`;
};

export interface ColorStopEditorProps {
  /** Current color stops */
  stops: ColorStop[];
  /** Callback when stops change */
  onChange: (stops: ColorStop[]) => void;
  /** Minimum number of stops (default: 2) */
  minStops?: number;
  /** Maximum number of stops (default: 5) */
  maxStops?: number;
  /** Optional className */
  className?: string;
}

export const ColorStopEditor: React.FC<ColorStopEditorProps> = ({
  stops,
  onChange,
  minStops = 2,
  maxStops = 5,
  className = '',
}) => {
  // Sort stops by position for display
  const sortedStops = [...stops].sort((a, b) => a.position - b.position);

  const handleColorChange = useCallback(
    (index: number, color: string) => {
      const newStops = stops.map((stop, i) =>
        i === index ? { ...stop, color: color.toUpperCase() } : stop
      );
      onChange(newStops);
    },
    [stops, onChange]
  );

  const handlePositionChange = useCallback(
    (index: number, position: number) => {
      const newStops = stops.map((stop, i) =>
        i === index ? { ...stop, position: Math.max(0, Math.min(100, position)) } : stop
      );
      onChange(newStops);
    },
    [stops, onChange]
  );

  const handleAddStop = useCallback(() => {
    if (stops.length >= maxStops) return;

    // Find the middle point between existing stops
    const sortedPositions = stops.map((s) => s.position).sort((a, b) => a - b);
    let newPosition = 50;

    // Find the largest gap
    let largestGap = 0;
    let gapStart = 0;
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      const gap = sortedPositions[i + 1] - sortedPositions[i];
      if (gap > largestGap) {
        largestGap = gap;
        gapStart = sortedPositions[i];
      }
    }
    newPosition = Math.round(gapStart + largestGap / 2);

    // Create new stop with the default color
    const newStop: ColorStop = {
      color: DEFAULT_NEW_STOP_COLOR,
      position: newPosition,
    };

    onChange([...stops, newStop]);
  }, [stops, maxStops, onChange]);

  const handleRemoveStop = useCallback(
    (index: number) => {
      if (stops.length <= minStops) return;
      const newStops = stops.filter((_, i) => i !== index);
      onChange(newStops);
    },
    [stops, minStops, onChange]
  );

  // Generate gradient preview string
  const previewGradient = sortedStops
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(', ');

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Gradient preview bar with stop indicators */}
      <div className="relative">
        <div
          className="h-6 rounded-lg border border-border overflow-hidden"
          style={{
            background: `linear-gradient(90deg, ${previewGradient})`,
          }}
        />
        {/* Stop position indicators */}
        <div className="absolute inset-x-0 -bottom-2 flex">
          {sortedStops.map((stop, i) => (
            <div
              key={generateStopKey(stop, i)}
              className="absolute w-3 h-3 rounded-full border-2 border-white shadow-md transform -translate-x-1/2"
              style={{
                left: `${stop.position}%`,
                backgroundColor: stop.color,
              }}
              title={`${stop.position}%`}
            />
          ))}
        </div>
      </div>

      {/* Color stop list */}
      <div className="space-y-3 pt-4">
        {stops.map((stop, index) => (
          <div
            key={generateStopKey(stop, index)}
            className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg border border-border"
          >
            {/* Drag handle */}
            <div className="text-text-tertiary cursor-grab">
              <GripVertical size={16} />
            </div>

            {/* Color picker */}
            <div className="relative">
              <input
                type="color"
                value={stop.color}
                onChange={(e) => handleColorChange(index, e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                aria-label={`Color for stop ${index + 1}`}
              />
            </div>

            {/* Color hex value */}
            <input
              type="text"
              value={stop.color}
              onChange={(e) => {
                const value = e.target.value.toUpperCase();
                if (/^#([A-F0-9]{0,6})$/i.test(value)) {
                  handleColorChange(index, value);
                }
              }}
              onBlur={(e) => {
                // Validate and correct on blur
                const value = e.target.value;
                if (!/^#([A-F0-9]{6})$/i.test(value)) {
                  handleColorChange(index, stop.color); // Reset to valid color
                }
              }}
              className="w-20 px-2 py-1 text-sm font-mono bg-surface border border-border rounded text-text-primary uppercase"
              maxLength={7}
              aria-label={`Hex color code for stop ${index + 1}`}
            />

            {/* Position slider */}
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={stop.position}
                onChange={(e) => handlePositionChange(index, parseInt(e.target.value, 10))}
                className="flex-1 h-2 accent-accent"
                aria-label={`Position for stop ${index + 1}`}
              />
              <span className="w-10 text-sm text-text-secondary text-right">
                {stop.position}%
              </span>
            </div>

            {/* Remove button */}
            {stops.length > minStops && (
              <button
                type="button"
                onClick={() => handleRemoveStop(index)}
                className="p-1.5 text-text-tertiary hover:text-error transition-colors rounded"
                aria-label={`Remove color stop ${index + 1}`}
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add stop button */}
      {stops.length < maxStops && (
        <AppButton
          variant="outline"
          size="sm"
          onClick={handleAddStop}
          className="w-full"
        >
          <Plus size={16} className="mr-2" />
          Add Color Stop ({stops.length}/{maxStops})
        </AppButton>
      )}
    </div>
  );
};

export default ColorStopEditor;
