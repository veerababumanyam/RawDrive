/**
 * FaceConfidenceFilter Component
 *
 * Slider/preset filter to control the minimum confidence threshold
 * for displayed face groups. Groups below the threshold are hidden.
 */

import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

export interface FaceConfidenceFilterProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  totalGroups: number;
  filteredGroups: number;
}

const PRESETS = [
  { label: 'All', value: 0 },
  { label: 'Low', value: 25 },
  { label: 'Med', value: 50 },
  { label: 'High', value: 75 },
] as const;

export const FaceConfidenceFilter: React.FC<FaceConfidenceFilterProps> = ({
  value,
  onChange,
  totalGroups,
  filteredGroups,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-surface border border-border/50 rounded-xl">
      {/* Icon + label */}
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <SlidersHorizontal className="w-4 h-4" />
        <span className="hidden sm:inline">Min. confidence:</span>
        <span className="font-medium text-text-primary">{value}%</span>
      </div>

      {/* Range slider */}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 min-w-[100px] max-w-[200px] h-1.5 rounded-full appearance-none bg-border accent-primary cursor-pointer"
        aria-label="Minimum confidence threshold"
      />

      {/* Preset buttons */}
      <div className="flex items-center gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => onChange(preset.value)}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${
              value === preset.value
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Count */}
      <span className="text-xs text-text-tertiary ml-auto">
        {filteredGroups} of {totalGroups}
      </span>
    </div>
  );
};

export default FaceConfidenceFilter;
