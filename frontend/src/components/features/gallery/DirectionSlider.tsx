/**
 * DirectionSlider Component
 * A circular slider for selecting gradient direction (0-359 degrees).
 *
 * Features:
 * - Visual compass-like direction indicator
 * - Click to set direction
 * - Numeric input for precise values
 * - Common angle presets (0°, 45°, 90°, 135°, 180°, etc.)
 */

import React, { useCallback, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

export interface DirectionSliderProps {
  /** Current direction in degrees (0-359) */
  value: number;
  /** Callback when direction changes */
  onChange: (degrees: number) => void;
  /** Optional className */
  className?: string;
}

// Common angle presets
const ANGLE_PRESETS = [
  { angle: 0, label: '↑' },
  { angle: 45, label: '↗' },
  { angle: 90, label: '→' },
  { angle: 135, label: '↘' },
  { angle: 180, label: '↓' },
  { angle: 225, label: '↙' },
  { angle: 270, label: '←' },
  { angle: 315, label: '↖' },
];

export const DirectionSlider: React.FC<DirectionSliderProps> = ({
  value,
  onChange,
  className = '',
}) => {
  const dialRef = useRef<HTMLDivElement>(null);

  const handleDialClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dialRef.current) return;

      const rect = dialRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const x = e.clientX - centerX;
      const y = e.clientY - centerY;

      // Calculate angle from center (0° is up, clockwise positive)
      let angle = Math.atan2(x, -y) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      // Round to nearest 5 degrees for easier selection
      angle = Math.round(angle / 5) * 5;
      if (angle >= 360) angle = 0;

      onChange(angle);
    },
    [onChange]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val)) {
        // Normalize to 0-359
        const normalized = ((val % 360) + 360) % 360;
        onChange(normalized);
      }
    },
    [onChange]
  );

  const handleReset = useCallback(() => {
    onChange(135); // Default direction
  }, [onChange]);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-secondary">
          Direction
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={359}
            value={value}
            onChange={handleInputChange}
            className="w-16 px-2 py-1 text-sm text-center bg-surface border border-border rounded text-text-primary"
            aria-label="Gradient direction in degrees"
          />
          <span className="text-sm text-text-tertiary">°</span>
          <AppButton
            variant="ghost"
            size="icon"
            onClick={handleReset}
            className="w-8 h-8"
            title="Reset to default (135°)"
          >
            <RotateCcw size={14} />
          </AppButton>
        </div>
      </div>

      {/* Circular dial */}
      <div className="flex justify-center">
        <div
          ref={dialRef}
          onClick={handleDialClick}
          className="relative w-32 h-32 rounded-full bg-surface-hover border-2 border-border cursor-crosshair"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={value}
          aria-label="Gradient direction dial"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') onChange((value + 5) % 360);
            if (e.key === 'ArrowLeft') onChange((value - 5 + 360) % 360);
            if (e.key === 'ArrowUp') onChange((value - 15 + 360) % 360);
            if (e.key === 'ArrowDown') onChange((value + 15) % 360);
          }}
        >
          {/* Direction indicator line */}
          <div
            className="absolute top-1/2 left-1/2 origin-bottom"
            style={{
              transform: `translate(-50%, -100%) rotate(${value}deg)`,
              width: 4,
              height: 48,
              background: 'linear-gradient(to top, var(--color-accent), var(--color-primary))',
              borderRadius: 2,
            }}
          />

          {/* Center dot */}
          <div className="absolute top-1/2 left-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-md" />

          {/* Angle markers */}
          {ANGLE_PRESETS.map((preset) => (
            <button
              key={preset.angle}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(preset.angle);
              }}
              className={`absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full text-xs font-medium transition-all
                ${
                  value === preset.angle
                    ? 'bg-accent text-white scale-110'
                    : 'bg-surface text-text-secondary hover:bg-border hover:text-text-primary'
                }
              `}
              style={{
                top: `${50 - 42 * Math.cos((preset.angle * Math.PI) / 180)}%`,
                left: `${50 + 42 * Math.sin((preset.angle * Math.PI) / 180)}%`,
              }}
              title={`${preset.angle}°`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick preset buttons */}
      <div className="flex flex-wrap justify-center gap-1">
        {ANGLE_PRESETS.map((preset) => (
          <button
            key={preset.angle}
            type="button"
            onClick={() => onChange(preset.angle)}
            className={`px-2 py-1 text-xs rounded transition-colors
              ${
                value === preset.angle
                  ? 'bg-accent text-white'
                  : 'bg-surface-hover text-text-secondary hover:bg-border'
              }
            `}
          >
            {preset.angle}°
          </button>
        ))}
      </div>
    </div>
  );
};

export default DirectionSlider;
