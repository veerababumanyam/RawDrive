/**
 * SimilarityStackSection Component
 *
 * Similarity organization controls for AI photo filtering (US5).
 * Allows hiding similar photos and showing only best shots from each group.
 *
 * Feature: 025-ai-filter-simplify
 */

import React, { useCallback, useId } from 'react';
import { AppButton } from '../../ui/AppButton';
import { Layers, Sparkles, SlidersHorizontal, Check, X } from 'lucide-react';
import type { SimilarityFilterState } from '../../../types/aiFilter';

// ============================================================================
// Toggle Component (inline, matches PrivacyToggle pattern)
// ============================================================================

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    disabled={disabled}
    className={`
      relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full
      border-2 border-transparent transition-colors duration-200 ease-in-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
      disabled:cursor-not-allowed disabled:opacity-50
      ${checked ? 'bg-primary' : 'bg-border'}
    `}
  >
    <span
      className={`
        pointer-events-none inline-block h-5 w-5 transform rounded-full
        bg-white shadow ring-0 transition duration-200 ease-in-out
        ${checked ? 'translate-x-5' : 'translate-x-0'}
      `}
    >
      <span
        className={`
          absolute inset-0 flex items-center justify-center transition-opacity
          ${checked ? 'opacity-0' : 'opacity-100'}
        `}
      >
        <X className="w-3 h-3 text-text-tertiary" />
      </span>
      <span
        className={`
          absolute inset-0 flex items-center justify-center transition-opacity
          ${checked ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <Check className="w-3 h-3 text-primary" />
      </span>
    </span>
  </button>
);

interface SimilarityStackSectionProps {
  hideSimilar: boolean;
  similarityThreshold: number;
  showOnlyBestShots: boolean;
  similarityGroupsCount?: number;
  onChange: (values: Partial<SimilarityFilterState>) => void;
}

const THRESHOLD_PRESETS = [
  { value: 0.95, label: 'Near-duplicates', description: 'Only hide near-identical photos' },
  { value: 0.85, label: 'Very similar', description: 'Hide photos that are very similar' },
  { value: 0.75, label: 'Similar', description: 'Hide photos with moderate similarity (recommended)' },
];

export const SimilarityStackSection: React.FC<SimilarityStackSectionProps> = ({
  hideSimilar,
  similarityThreshold,
  showOnlyBestShots,
  similarityGroupsCount = 0,
  onChange,
}) => {
  const sectionId = useId();
  const thresholdId = useId();

  const handleToggleHideSimilar = useCallback(
    (enabled: boolean) => {
      onChange({
        hideSimilar: enabled,
        // Reset other options when disabling
        ...(enabled ? {} : { showOnlyBestShots: false }),
      });
    },
    [onChange]
  );

  const handleThresholdChange = useCallback(
    (value: number) => {
      onChange({ similarityThreshold: value });
    },
    [onChange]
  );

  const handleToggleBestShots = useCallback(
    (enabled: boolean) => {
      onChange({ showOnlyBestShots: enabled });
    },
    [onChange]
  );

  return (
    <fieldset
      className="border-0 p-0 m-0 space-y-4"
      aria-labelledby={`${sectionId}-legend`}
    >
      <legend
        id={`${sectionId}-legend`}
        className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"
      >
        <Layers className="w-4 h-4" />
        Similar Photo Organization
        {similarityGroupsCount > 0 && (
          <span className="ml-2 text-xs font-normal text-text-tertiary bg-surface-tertiary px-2 py-0.5 rounded-full">
            {similarityGroupsCount} groups
          </span>
        )}
      </legend>

      {/* Main Toggle: Hide Similar */}
      <div className="flex items-center justify-between p-3 bg-surface-secondary rounded-lg">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-text-secondary" />
          <div>
            <div className="text-sm font-medium text-text-primary">
              Hide Similar Photos
            </div>
            <div className="text-xs text-text-tertiary">
              Stack similar photos and show only one from each group
            </div>
          </div>
        </div>
        <Toggle
          checked={hideSimilar}
          onChange={handleToggleHideSimilar}
          label="Hide similar photos"
        />
      </div>

      {/* Similarity Threshold (when enabled) */}
      {hideSimilar && (
        <div className="pl-2 space-y-3">
          {/* Threshold Presets */}
          <div>
            <label
              id={`${thresholdId}-label`}
              className="block text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Similarity Threshold
            </label>
            <div
              role="radiogroup"
              aria-labelledby={`${thresholdId}-label`}
              className="flex flex-wrap gap-2"
            >
              {THRESHOLD_PRESETS.map((preset) => (
                <AppButton
                  key={preset.value}
                  variant={similarityThreshold === preset.value ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => handleThresholdChange(preset.value)}
                  aria-checked={similarityThreshold === preset.value}
                  role="radio"
                  title={preset.description}
                >
                  {preset.label}
                </AppButton>
              ))}
            </div>
            <p className="text-[11px] text-text-tertiary mt-1.5">
              {getThresholdDescription(similarityThreshold)}
            </p>
          </div>

          {/* Custom Threshold Slider */}
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.5}
              max={0.99}
              step={0.01}
              value={similarityThreshold}
              onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer accent-primary"
              aria-label="Similarity threshold slider"
            />
            <span className="text-xs font-mono text-text-secondary w-12 text-right">
              {Math.round(similarityThreshold * 100)}%
            </span>
          </div>

          {/* Best Shots Only Toggle */}
          <div className="flex items-center justify-between p-3 bg-surface-tertiary/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <div>
                <div className="text-sm font-medium text-text-primary">
                  Show Only Best Shots
                </div>
                <div className="text-xs text-text-tertiary">
                  AI picks the best photo from each similar group
                </div>
              </div>
            </div>
            <Toggle
              checked={showOnlyBestShots}
              onChange={handleToggleBestShots}
              label="Show only best shots"
            />
          </div>
        </div>
      )}

      {/* Helper text when disabled */}
      {!hideSimilar && (
        <p className="text-xs text-text-tertiary pl-2">
          Enable &quot;Hide Similar Photos&quot; to reduce visual clutter and organize
          similar shots into stacks.
        </p>
      )}
    </fieldset>
  );
};

function getThresholdDescription(threshold: number): string {
  if (threshold >= 0.95) {
    return 'Only nearly identical photos will be grouped (most permissive)';
  } else if (threshold >= 0.85) {
    return 'Very similar photos will be grouped';
  } else if (threshold >= 0.75) {
    return 'Moderately similar photos will be grouped (recommended)';
  } else if (threshold >= 0.65) {
    return 'Photos with some similarity will be grouped';
  } else {
    return 'Loosely similar photos will be grouped (most aggressive)';
  }
}
