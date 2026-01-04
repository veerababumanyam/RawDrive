/**
 * GradientPicker Component
 * A visual grid for browsing and selecting gradient presets with category filtering.
 *
 * Features:
 * - Grid layout of gradient thumbnails
 * - Category tabs for filtering (All, Warm, Cool, Professional, Vibrant)
 * - Visual selection indicator
 * - Hover tooltips showing gradient name
 * - Keyboard navigation support
 * - "Customize" button to open GradientEditor (Phase 5)
 * - "Remove Gradient" option to clear selection
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Palette, X, Sparkles } from 'lucide-react';
import { GradientThumbnail } from './GradientThumbnail';
import { GRADIENT_PRESETS, GRADIENT_CATEGORIES, getPresetsByCategory } from '../../../constants/gradientPresets';
import { AppButton } from '../../ui/AppButton';
import type { GradientConfiguration, GradientCategory, GradientPreset, ColorStop } from '../../../types/gradient';

export interface GradientPickerProps {
  /** Currently selected gradient configuration */
  value: GradientConfiguration | null;
  /** Callback when a gradient is selected */
  onChange: (gradient: GradientConfiguration | null) => void;
  /** Callback to open the gradient editor for customization (Phase 5) */
  onCustomize?: (gradient: GradientConfiguration) => void;
  /** Whether to show the customize button */
  showCustomize?: boolean;
  /** Whether to show the remove button */
  showRemove?: boolean;
  /** Optional className for styling */
  className?: string;
}

type FilterCategory = GradientCategory | 'all';

export const GradientPicker: React.FC<GradientPickerProps> = ({
  value,
  onChange,
  onCustomize,
  showCustomize = true,
  showRemove = true,
  className = '',
}) => {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');

  // Filter presets by category
  const filteredPresets = useMemo(() => {
    if (activeCategory === 'all') {
      return GRADIENT_PRESETS;
    }
    return getPresetsByCategory(activeCategory);
  }, [activeCategory]);

  // Determine if a preset is currently selected
  const isPresetSelected = useCallback(
    (preset: GradientPreset): boolean => {
      if (!value) return false;
      // Check if preset_id matches, or if colors match exactly
      if (value.preset_id === preset.id) return true;
      // Also check if colors match for custom gradients that started from a preset
      if (
        value.colors.length === preset.config.colors.length &&
        value.direction === preset.config.direction &&
        value.colors.every(
          (stop: ColorStop, i: number) =>
            stop.color.toUpperCase() === preset.config.colors[i].color.toUpperCase() &&
            stop.position === preset.config.colors[i].position
        )
      ) {
        return true;
      }
      return false;
    },
    [value]
  );

  const handlePresetSelect = useCallback(
    (preset: GradientPreset) => {
      onChange(preset.config);
    },
    [onChange]
  );

  const handleRemoveGradient = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const handleCustomize = useCallback(() => {
    if (onCustomize) {
      // If there's a current value, use it; otherwise start with a default
      const startingGradient = value || {
        type: 'linear' as const,
        preset_id: null,
        direction: 135,
        colors: [
          { color: '#6366F1', position: 0 },
          { color: '#8B5CF6', position: 100 },
        ],
      };
      onCustomize(startingGradient);
    }
  }, [onCustomize, value]);

  // Check if current value is a custom gradient (not matching any preset)
  const isCustomGradient = useMemo(() => {
    if (!value) return false;
    return !GRADIENT_PRESETS.some((preset) => isPresetSelected(preset));
  }, [value, isPresetSelected]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with title and action buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette size={18} className="text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Gradient Presets</span>
        </div>
        <div className="flex items-center gap-2">
          {showCustomize && onCustomize && (
            <AppButton
              variant="outline"
              size="sm"
              onClick={handleCustomize}
              className="text-xs"
            >
              <Sparkles size={14} className="mr-1" />
              Customize
            </AppButton>
          )}
          {showRemove && value && (
            <AppButton
              variant="ghost"
              size="sm"
              onClick={handleRemoveGradient}
              className="text-xs text-text-tertiary hover:text-error"
            >
              <X size={14} className="mr-1" />
              Remove
            </AppButton>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`
            px-3 py-1.5 text-xs font-medium rounded-full transition-colors
            ${
              activeCategory === 'all'
                ? 'bg-accent text-white'
                : 'bg-surface-hover text-text-secondary hover:text-text-primary hover:bg-border'
            }
          `}
        >
          All
        </button>
        {GRADIENT_CATEGORIES.map((category) => (
          <button
            key={category.value}
            type="button"
            onClick={() => setActiveCategory(category.value)}
            className={`
              px-3 py-1.5 text-xs font-medium rounded-full transition-colors
              ${
                activeCategory === category.value
                  ? 'bg-accent text-white'
                  : 'bg-surface-hover text-text-secondary hover:text-text-primary hover:bg-border'
              }
            `}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Gradient grid */}
      <div
        className="grid grid-cols-5 gap-3"
        role="listbox"
        aria-label="Gradient presets"
      >
        {filteredPresets.map((preset) => (
          <GradientThumbnail
            key={preset.id}
            config={preset.config}
            name={preset.name}
            isSelected={isPresetSelected(preset)}
            onSelect={() => handlePresetSelect(preset)}
            size="md"
          />
        ))}
      </div>

      {/* Custom gradient indicator */}
      {isCustomGradient && value && (
        <div className="flex items-center gap-2 p-2 bg-surface-hover rounded-lg border border-border">
          <div
            className="w-8 h-8 rounded-md ring-1 ring-border"
            style={{
              background: `linear-gradient(${value.direction}deg, ${value.colors
                .map((s: ColorStop) => `${s.color} ${s.position}%`)
                .join(', ')})`,
            }}
          />
          <span className="text-xs text-text-secondary">
            Custom gradient selected
          </span>
          {showCustomize && onCustomize && (
            <AppButton
              variant="ghost"
              size="sm"
              onClick={handleCustomize}
              className="ml-auto text-xs"
            >
              Edit
            </AppButton>
          )}
        </div>
      )}

      {/* Empty state when no presets in category */}
      {filteredPresets.length === 0 && (
        <div className="py-8 text-center text-text-tertiary text-sm">
          No gradients in this category
        </div>
      )}
    </div>
  );
};

export default GradientPicker;
