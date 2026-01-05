/**
 * SmartCollectionSelector Component
 *
 * Accessible preset selector for AI curation presets.
 * Implements keyboard navigation (arrow keys, Enter, Space) and ARIA listbox pattern.
 *
 * Feature: 025-ai-filter-simplify (T036, T059 accessibility)
 */

import React, { useEffect, useState, useCallback, useRef, useId } from 'react';
import { Sparkles, Check, AlertCircle } from 'lucide-react';
import { aiFilterService } from '../../../services/aiFilterService';
import type { CurationPreset } from '../../../types/aiFilter';
import { useAuth } from '../../../contexts/AuthContext';

interface SmartCollectionSelectorProps {
  selectedPresetId?: string;
  onSelect: (preset: CurationPreset) => void;
}

export const SmartCollectionSelector: React.FC<SmartCollectionSelectorProps> = ({
  selectedPresetId,
  onSelect,
}) => {
  const { workspace } = useAuth();
  const [presets, setPresets] = useState<CurationPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!workspace?.workspace_id) return;

    const fetchPresets = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await aiFilterService.getPresets(workspace.workspace_id);
        setPresets(data);
      } catch (err) {
        setError('Failed to load presets');
      } finally {
        setLoading(false);
      }
    };

    fetchPresets();
  }, [workspace?.workspace_id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (presets.length === 0) return;

      let newIndex = focusedIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = focusedIndex < presets.length - 1 ? focusedIndex + 1 : 0;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = focusedIndex > 0 ? focusedIndex - 1 : presets.length - 1;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = presets.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < presets.length) {
            onSelect(presets[focusedIndex]);
          }
          return;
        default:
          return;
      }

      setFocusedIndex(newIndex);
      // Focus the button at the new index
      const buttons = listRef.current?.querySelectorAll('button');
      buttons?.[newIndex]?.focus();
    },
    [focusedIndex, presets, onSelect]
  );

  if (loading) {
    return (
      <div className="text-sm text-text-secondary animate-pulse" role="status" aria-live="polite">
        Loading collections...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-error" role="alert">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="text-sm text-text-secondary" role="status">
        No presets available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div id={labelId} className="text-sm font-semibold text-text-primary">
        Smart Collections
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-labelledby={labelId}
        aria-activedescendant={focusedIndex >= 0 ? `preset-${presets[focusedIndex]?.preset_id}` : undefined}
        onKeyDown={handleKeyDown}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      >
        {presets.map((preset, index) => {
          const isSelected = selectedPresetId === preset.preset_id;
          const isFocused = focusedIndex === index;

          return (
            <button
              key={preset.preset_id}
              id={`preset-${preset.preset_id}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                setFocusedIndex(index);
                onSelect(preset);
              }}
              onFocus={() => setFocusedIndex(index)}
              className={`
                relative flex flex-col items-start p-4 rounded-xl border text-left transition-all
                focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                ${
                  isSelected
                    ? 'bg-primary/5 border-primary ring-1 ring-primary'
                    : 'bg-surface border-border hover:border-primary/50 hover:bg-surface-hover'
                }
                ${isFocused && !isSelected ? 'ring-1 ring-primary/50' : ''}
              `}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles
                    size={16}
                    className={isSelected ? 'text-primary' : 'text-text-tertiary'}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-sm text-text-primary">{preset.name}</span>
                </div>
                {isSelected && (
                  <Check size={16} className="text-primary" aria-hidden="true" />
                )}
              </div>
              <p className="text-xs text-text-secondary line-clamp-2">{preset.description}</p>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-text-tertiary">
        Use arrow keys to navigate, Enter or Space to select
      </p>
    </div>
  );
};
