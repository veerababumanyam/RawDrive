/**
 * GeminiModelSelector Component
 * Model selection dropdown/radio group for Gemini model preference.
 * Feature: 003-user-gemini-settings (T027)
 *
 * Displays active models from admin-managed catalogue with:
 * - Clear indication of platform default
 * - Option to use platform default (no explicit selection)
 * - Description and capabilities for each model
 */

import React, { useState, useCallback } from 'react';
import { Loader2, Sparkles, Check, ChevronDown, Info } from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import type { GeminiModel, UserGeminiSettings } from '../../types/geminiSettings';

interface GeminiModelSelectorProps {
  /** Available models from the catalogue */
  models: GeminiModel[];
  /** Current user settings */
  settings: UserGeminiSettings | null;
  /** Called when model selection changes */
  onSelect: (modelId: string | null) => Promise<unknown>;
  /** Loading state */
  loading?: boolean;
  /** Loading state for models list */
  modelsLoading?: boolean;
  /** Disabled state (e.g., when no API key is configured) */
  disabled?: boolean;
}

export const GeminiModelSelector: React.FC<GeminiModelSelectorProps> = ({
  models,
  settings,
  onSelect,
  loading = false,
  modelsLoading = false,
  disabled = false,
}) => {
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const selectedModelId = settings?.selected_model?.model_id || null;
  const effectiveModel = settings?.effective_model;

  const handleSelect = useCallback(
    async (modelId: string | null) => {
      if (saving || disabled) return;

      // If selecting the same model, do nothing
      if (modelId === selectedModelId) return;

      setSaving(true);
      try {
        await onSelect(modelId);
      } finally {
        setSaving(false);
      }
    },
    [selectedModelId, onSelect, saving, disabled]
  );

  if (modelsLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="text-center p-6 bg-surface-hover rounded-lg border border-border">
        <Sparkles className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
        <p className="text-sm text-text-secondary">
          No models available. Contact your administrator.
        </p>
      </div>
    );
  }

  const isDisabledState = disabled || saving || loading;

  return (
    <div className="space-y-4">
      {/* Current selection display */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Selected Model</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {effectiveModel ? (
              <>
                Using{' '}
                <span className="font-medium">{effectiveModel.display_name}</span>
                {!selectedModelId && (
                  <span className="text-text-tertiary"> (platform default)</span>
                )}
              </>
            ) : (
              'No model configured'
            )}
          </p>
        </div>

        <AppButton
          variant="outline"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          disabled={isDisabledState}
          aria-expanded={expanded}
          aria-controls="model-list"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <ChevronDown
              className={`w-4 h-4 mr-2 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          )}
          Change Model
        </AppButton>
      </div>

      {/* Model selection list */}
      {expanded && (
        <div
          id="model-list"
          className="border border-border rounded-lg overflow-hidden"
          role="radiogroup"
          aria-label="Select Gemini model"
        >
          {/* Platform default option */}
          <ModelOption
            key="default"
            model={null}
            displayName="Use Platform Default"
            description={
              models.find((m) => m.is_default)
                ? `Currently: ${models.find((m) => m.is_default)?.display_name}`
                : undefined
            }
            isSelected={selectedModelId === null}
            isDefault={true}
            onSelect={() => handleSelect(null)}
            disabled={isDisabledState}
          />

          {/* Available models */}
          {models.map((model) => (
            <ModelOption
              key={model.model_id}
              model={model}
              displayName={model.display_name}
              isSelected={selectedModelId === model.model_id}
              isDefault={model.is_default}
              onSelect={() => handleSelect(model.model_id)}
              disabled={isDisabledState}
            />
          ))}
        </div>
      )}

      {/* Help text */}
      {disabled && (
        <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg">
          <Info className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">
            Configure your API key first to select a model.
          </p>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ModelOption Component
// ---------------------------------------------------------------------------

interface ModelOptionProps {
  model: GeminiModel | null;
  displayName: string;
  description?: string;
  isSelected: boolean;
  isDefault: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

const ModelOption: React.FC<ModelOptionProps> = ({
  model,
  displayName,
  description,
  isSelected,
  isDefault,
  onSelect,
  disabled,
}) => {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      disabled={disabled}
      className={`
        w-full text-left px-4 py-3 border-b border-border last:border-b-0
        transition-colors
        ${isSelected ? 'bg-primary/5' : 'bg-surface hover:bg-surface-hover'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Radio indicator */}
        <div
          className={`
            w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
            ${isSelected ? 'border-primary bg-primary' : 'border-border'}
          `}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>

        {/* Model info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${isSelected ? 'text-primary' : 'text-text-primary'}`}
            >
              {displayName}
            </span>
            {isDefault && model !== null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent">
                Default
              </span>
            )}
          </div>

          {description && (
            <p className="text-xs text-text-secondary mt-0.5">{description}</p>
          )}

          {model?.identifier && (
            <p className="text-xs text-text-tertiary font-mono mt-1">
              {model.identifier}
            </p>
          )}
        </div>
      </div>
    </button>
  );
};

export default GeminiModelSelector;
