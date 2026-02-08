/**
 * Accent Swatch Selector Component - Gallery Design Studio
 *
 * Displays accent color swatches for the currently selected theme.
 * Each theme has 3-5 predefined accent colors that maintain visual harmony.
 *
 * Feature: Gallery Design Studio - Accent Color Override (T012-T014)
 * Tasks: T013 - AccentSwatchSelector component
 */

import React, { useCallback, useRef, useState } from 'react';
import { ThemeId, GalleryThemeAccentSwatch } from '../../../../types/gallery-design';
import { GALLERY_THEMES } from '../../../../constants/galleryThemes';
import { DesignStudioTooltip } from './DesignStudioTooltip';
import { Check, RefreshCcw } from 'lucide-react';

interface AccentSwatchSelectorProps {
  themeId: ThemeId;
  selectedAccent?: string;
  onChange: (accentHex: string | undefined) => void;
  disabled?: boolean;
}

export const AccentSwatchSelector: React.FC<AccentSwatchSelectorProps> = ({
  themeId,
  selectedAccent,
  onChange,
  disabled = false,
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const gridRef = useRef<HTMLDivElement>(null);

  // Get accent swatches for the current theme
  const theme = GALLERY_THEMES[themeId];
  const swatches = theme?.accentSwatches || [];

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const totalSwatches = swatches.length + 1; // +1 for reset button
      let newIndex = focusedIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = focusedIndex < totalSwatches - 1 ? focusedIndex + 1 : 0;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = focusedIndex > 0 ? focusedIndex - 1 : totalSwatches - 1;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = totalSwatches - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex === 0) {
            // Reset to default
            onChange(undefined);
          } else if (focusedIndex > 0 && focusedIndex <= swatches.length) {
            onChange(swatches[focusedIndex - 1].hex);
          }
          return;
        default:
          return;
      }

      setFocusedIndex(newIndex);

      // Focus the new element
      const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      buttons?.[newIndex]?.focus();
    },
    [focusedIndex, disabled, onChange, swatches]
  );

  // Check if an accent is the default (first swatch or undefined)
  const isDefaultAccent = !selectedAccent || selectedAccent === swatches[0]?.hex;

  return (
    <div data-testid="accent-swatch-selector" className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Accent color</h4>
        <DesignStudioTooltip content="Customize the accent color while maintaining theme harmony">
          <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
        </DesignStudioTooltip>
      </div>

      <div
        ref={gridRef}
        role="listbox"
        aria-label="Select accent color"
        aria-activedescendant={
          focusedIndex >= 0
            ? focusedIndex === 0
              ? 'accent-reset'
              : `accent-${focusedIndex - 1}`
            : undefined
        }
        className="flex flex-wrap gap-2 items-center"
        onKeyDown={handleKeyDown}
      >
        {/* Reset to Default Button */}
        <DesignStudioTooltip content="Reset to theme default" position="bottom">
          <button
            id="accent-reset"
            role="option"
            aria-selected={isDefaultAccent}
            aria-label="Reset to default accent color"
            onClick={() => onChange(undefined)}
            onFocus={() => setFocusedIndex(0)}
            disabled={disabled}
            className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${
              isDefaultAccent
                ? 'bg-cyan-400/20 border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)] scale-110'
                : 'bg-gray-200 dark:bg-white/10 border border-gray-300 dark:border-white/20 hover:bg-gray-300 dark:hover:bg-white/20 hover:scale-105'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${isDefaultAccent ? 'text-cyan-400' : 'text-gray-500 dark:text-white/50'}`} />
            {isDefaultAccent && (
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyan-400 flex items-center justify-center shadow-md">
                <Check className="w-2 h-2 text-white" />
              </div>
            )}
          </button>
        </DesignStudioTooltip>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-300 dark:bg-white/10" />

        {/* Accent Swatches */}
        {swatches.map((swatch, index) => {
          const isSelected = selectedAccent === swatch.hex;
          const isFocused = focusedIndex === index + 1;

          return (
            <AccentSwatch
              key={swatch.hex}
              swatch={swatch}
              index={index}
              isSelected={isSelected}
              isFocused={isFocused}
              onSelect={() => onChange(swatch.hex)}
              onFocus={() => setFocusedIndex(index + 1)}
              disabled={disabled}
            />
          );
        })}
      </div>

      {/* Current accent indicator */}
      {selectedAccent && !isDefaultAccent && (
        <div className="flex items-center gap-2 text-[9px] text-gray-500 dark:text-white/40">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedAccent }} />
          <span>Custom accent active</span>
        </div>
      )}
    </div>
  );
};

/**
 * Individual Accent Swatch Component
 */
interface AccentSwatchProps {
  swatch: GalleryThemeAccentSwatch;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onFocus: () => void;
  disabled?: boolean;
}

const AccentSwatch: React.FC<AccentSwatchProps> = ({
  swatch,
  index,
  isSelected,
  isFocused,
  onSelect,
  onFocus,
  disabled = false,
}) => {
  return (
    <DesignStudioTooltip content={swatch.name} position="bottom">
      <button
        id={`accent-${index}`}
        role="option"
        aria-selected={isSelected}
        aria-label={`${swatch.name} accent color`}
        onClick={onSelect}
        onFocus={onFocus}
        disabled={disabled}
        className={`group relative w-8 h-8 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${
          isSelected
            ? 'scale-110 shadow-[0_0_20px_var(--swatch-color,rgba(0,0,0,0.3))]'
            : isFocused
              ? 'scale-105 shadow-lg'
              : 'hover:scale-105 hover:shadow-md'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
        style={{
          backgroundColor: swatch.hex,
          '--swatch-color': `${swatch.hex}66`,
        } as React.CSSProperties}
      >
        {/* Inner highlight for depth */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%, rgba(0,0,0,0.2) 100%)`,
          }}
        />

        {/* Selection ring */}
        {isSelected && (
          <>
            <div className="absolute inset-0 rounded-full ring-2 ring-white dark:ring-black ring-offset-2" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-white/90 dark:bg-black/80 flex items-center justify-center shadow-md">
                <Check className="w-2.5 h-2.5 text-gray-900 dark:text-white" />
              </div>
            </div>
          </>
        )}

        {/* Hover glow effect */}
        <div
          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{
            boxShadow: `0 0 15px ${swatch.hex}`,
          }}
        />
      </button>
    </DesignStudioTooltip>
  );
};

export default AccentSwatchSelector;
