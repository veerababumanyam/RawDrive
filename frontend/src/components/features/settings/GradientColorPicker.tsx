/**
 * GradientColorPicker
 *
 * Gradient + solid color picker wrapper.
 * Wraps react-best-gradient-color-picker with a label and color preview swatch.
 */

import React from 'react';
import ColorPicker from 'react-best-gradient-color-picker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GradientColorPickerProps {
  /** Current CSS color or gradient string */
  value: string;
  /** Callback when color changes */
  onChange: (value: string) => void;
  /** Optional label */
  label?: string;
}

// ---------------------------------------------------------------------------
// GradientColorPicker
// ---------------------------------------------------------------------------

export function GradientColorPicker({ value, onChange, label }: GradientColorPickerProps) {
  return (
    <div className="space-y-3">
      {/* Label */}
      {label && (
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
      )}

      {/* Color preview swatch */}
      <div className="flex items-center gap-3">
        <div
          data-testid="color-swatch"
          className="w-10 h-10 rounded-full border border-zinc-300 dark:border-zinc-600 shrink-0"
          style={{ background: value }}
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[200px]">
          {value}
        </span>
      </div>

      {/* Color picker */}
      <ColorPicker
        value={value}
        onChange={onChange}
        width={280}
        height={160}
      />
    </div>
  );
}
