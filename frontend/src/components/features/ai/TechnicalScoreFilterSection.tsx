/**
 * TechnicalScoreFilterSection Component
 *
 * Accessible technical score filter controls for AI photo filtering.
 * Provides sharpness, exposure, and composition minimum threshold inputs.
 *
 * Feature: 025-ai-filter-simplify (T059 accessibility)
 */

import React, { useId } from 'react';
import { AppInput } from '../../ui/AppInput';

interface TechnicalScoreFilterSectionProps {
  minSharpness?: number;
  minExposure?: number;
  minComposition?: number;
  onChange: (values: { minSharpness?: number; minExposure?: number; minComposition?: number }) => void;
}

interface ScoreInputProps {
  id: string;
  label: string;
  description: string;
  value?: number;
  onValueChange: (value?: number) => void;
}

const ScoreInput: React.FC<ScoreInputProps> = ({
  id,
  label,
  description,
  value,
  onValueChange,
}) => {
  const descId = `${id}-desc`;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-text-secondary min-w-[90px]">
        {label}
      </label>
      <AppInput
        id={id}
        type="number"
        min={0}
        max={100}
        step={1}
        inputSize="sm"
        className="w-24"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = raw === '' ? undefined : Number(raw);
          onValueChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
        aria-describedby={descId}
      />
      <span id={descId} className="sr-only">
        {description}
      </span>
    </div>
  );
};

export const TechnicalScoreFilterSection: React.FC<TechnicalScoreFilterSectionProps> = ({
  minSharpness,
  minExposure,
  minComposition,
  onChange,
}) => {
  const baseId = useId();

  return (
    <fieldset className="space-y-3 border-0 p-0 m-0">
      <legend className="text-sm font-semibold text-text-primary mb-2">
        Technical Scores
      </legend>
      <p className="text-xs text-text-tertiary mb-2">
        Set minimum thresholds (0-100) for each technical metric
      </p>
      <div className="flex flex-col gap-2" role="group" aria-label="Technical score filters">
        <ScoreInput
          id={`${baseId}-sharpness`}
          label="Sharpness"
          description="Minimum sharpness score from 0 to 100. Higher values require sharper photos."
          value={minSharpness}
          onValueChange={(v) => onChange({ minSharpness: v })}
        />
        <ScoreInput
          id={`${baseId}-exposure`}
          label="Exposure"
          description="Minimum exposure score from 0 to 100. Higher values require better-exposed photos."
          value={minExposure}
          onValueChange={(v) => onChange({ minExposure: v })}
        />
        <ScoreInput
          id={`${baseId}-composition`}
          label="Composition"
          description="Minimum composition score from 0 to 100. Higher values require better-composed photos."
          value={minComposition}
          onValueChange={(v) => onChange({ minComposition: v })}
        />
      </div>
    </fieldset>
  );
};
