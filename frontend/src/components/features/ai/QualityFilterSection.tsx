/**
 * QualityFilterSection Component
 *
 * Accessible quality tier filter controls for AI photo filtering.
 * Uses semantic HTML (fieldset/legend) and ARIA attributes for screen readers.
 *
 * Feature: 025-ai-filter-simplify (T059 accessibility)
 */

import React from 'react';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import type { QualityTier } from '../../../types/aiFilter';

interface QualityFilterSectionProps {
  qualityTier: QualityTier;
  qualityMin?: number;
  onChange: (values: { qualityTier?: QualityTier; qualityMin?: number }) => void;
}

const tierLabels: { value: QualityTier; label: string; description: string }[] = [
  { value: 'all', label: 'All', description: 'Show all photos regardless of quality' },
  { value: 'excellent', label: 'Excellent (90+)', description: 'Show only photos with 90 or higher quality score' },
  { value: 'good', label: 'Good (70+)', description: 'Show photos with 70 or higher quality score' },
  { value: 'fair', label: 'Fair (50+)', description: 'Show photos with 50 or higher quality score' },
];

export const QualityFilterSection: React.FC<QualityFilterSectionProps> = ({
  qualityTier,
  qualityMin,
  onChange,
}) => {
  return (
    <fieldset className="space-y-3 border-0 p-0 m-0">
      <legend className="text-sm font-semibold text-text-primary mb-2">
        Quality Filter
      </legend>
      <div
        role="group"
        aria-label="Quality tier selection"
        className="flex flex-wrap gap-2"
      >
        {tierLabels.map((tier) => (
          <AppButton
            key={tier.value}
            variant={qualityTier === tier.value ? 'primary' : 'outline'}
            size="sm"
            onClick={() => onChange({ qualityTier: tier.value })}
            aria-pressed={qualityTier === tier.value}
            aria-label={tier.description}
            title={tier.description}
          >
            {tier.label}
          </AppButton>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm text-text-secondary" htmlFor="quality-min-input">
          Minimum score
        </label>
        <AppInput
          id="quality-min-input"
          type="number"
          min={0}
          max={100}
          step={1}
          inputSize="sm"
          className="w-24"
          value={qualityMin ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            const numeric = value === '' ? undefined : Number(value);
            onChange({ qualityMin: Number.isFinite(numeric) ? numeric : undefined });
          }}
          aria-describedby="quality-min-desc"
        />
        <span id="quality-min-desc" className="sr-only">
          Enter a minimum quality score from 0 to 100. Photos below this score will be hidden.
        </span>
      </div>
    </fieldset>
  );
};
