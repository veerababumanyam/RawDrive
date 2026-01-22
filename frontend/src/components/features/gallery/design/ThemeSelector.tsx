/**
 * Theme Selector Component - Gallery Design Studio
 *
 * Displays available gallery themes in a bento-grid layout with:
 * - Color swatch previews for each theme
 * - Selected state visual feedback (ring + checkmark)
 * - Keyboard navigation (arrow keys, Enter to select)
 * - Hover/focus states showing theme name and description
 * - Light/Dark/System mode toggle
 *
 * Feature: Gallery Design Studio - Theme Selection (US5)
 */

import React, { useCallback, useRef, useState } from 'react';
import { ThemeId, ThemeMode } from '../../../../types/gallery-design';
import { GALLERY_THEMES } from '../../../../constants/galleryThemes';

interface ThemeSelectorProps {
  selectedTheme: ThemeId;
  selectedMode: ThemeMode;
  onThemeChange: (themeId: ThemeId) => void;
  onModeChange: (mode: ThemeMode) => void;
  disabled?: boolean;
}

// Get all available themes as an array
const THEME_LIST = Object.values(GALLERY_THEMES);

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedTheme,
  selectedMode,
  onThemeChange,
  onModeChange,
  disabled = false,
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const gridRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation within the theme grid
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const cols = 3; // Grid columns
      const totalThemes = THEME_LIST.length;

      let newIndex = focusedIndex;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          newIndex = focusedIndex < totalThemes - 1 ? focusedIndex + 1 : 0;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          newIndex = focusedIndex > 0 ? focusedIndex - 1 : totalThemes - 1;
          break;
        case 'ArrowDown':
          e.preventDefault();
          newIndex = focusedIndex + cols < totalThemes ? focusedIndex + cols : focusedIndex % cols;
          break;
        case 'ArrowUp':
          e.preventDefault();
          newIndex = focusedIndex - cols >= 0 ? focusedIndex - cols : totalThemes - cols + (focusedIndex % cols);
          if (newIndex < 0) newIndex = focusedIndex;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = totalThemes - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalThemes) {
            onThemeChange(THEME_LIST[focusedIndex].id as ThemeId);
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
    [focusedIndex, disabled, onThemeChange]
  );

  return (
    <div className="space-y-4">
      {/* Theme Grid - Bento Layout */}
      <div>
        <h3 className="font-medium text-sm text-text-primary mb-3">Theme</h3>
        <div
          ref={gridRef}
          role="listbox"
          aria-label="Select gallery theme"
          aria-activedescendant={focusedIndex >= 0 ? `theme-${THEME_LIST[focusedIndex]?.id}` : undefined}
          className="grid grid-cols-3 gap-2"
          onKeyDown={handleKeyDown}
        >
          {THEME_LIST.map((theme, index) => (
            <ThemeSwatch
              key={theme.id}
              theme={theme}
              isSelected={selectedTheme === theme.id}
              isFocused={focusedIndex === index}
              mode={selectedMode === 'system' ? 'light' : selectedMode}
              onSelect={() => onThemeChange(theme.id as ThemeId)}
              onFocus={() => setFocusedIndex(index)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="border-t border-border-default pt-3">
        <h4 className="text-xs font-medium text-text-primary mb-2">Mode</h4>
        <div className="flex gap-1 p-1 bg-bg-secondary rounded-lg" role="radiogroup" aria-label="Theme mode">
          {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              role="radio"
              aria-checked={selectedMode === mode}
              onClick={() => onModeChange(mode)}
              disabled={disabled}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedMode === mode
                  ? 'bg-accent-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {mode === 'light' && '☀️ '}
              {mode === 'dark' && '🌙 '}
              {mode === 'system' && '💻 '}
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Individual Theme Swatch Component
 */
interface ThemeSwatchProps {
  theme: (typeof THEME_LIST)[0];
  isSelected: boolean;
  isFocused: boolean;
  mode: 'light' | 'dark';
  onSelect: () => void;
  onFocus: () => void;
  disabled?: boolean;
}

const ThemeSwatch: React.FC<ThemeSwatchProps> = ({
  theme,
  isSelected,
  isFocused,
  mode,
  onSelect,
  onFocus,
  disabled = false,
}) => {
  const tokens = theme[mode];

  return (
    <button
      id={`theme-${theme.id}`}
      role="option"
      aria-selected={isSelected}
      aria-label={`${theme.name}: ${theme.description}`}
      onClick={onSelect}
      onFocus={onFocus}
      disabled={disabled}
      className={`group relative flex flex-col p-2 rounded-lg border-2 transition-all ${
        isSelected
          ? 'border-accent-primary ring-2 ring-accent-primary/30 shadow-md'
          : isFocused
            ? 'border-accent-primary/50 shadow-sm'
            : 'border-border-default hover:border-accent-primary/50 hover:shadow-sm'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      title={theme.description}
    >
      {/* Color Swatch Preview */}
      <div
        className="relative aspect-[4/3] rounded overflow-hidden mb-2"
        style={{ backgroundColor: tokens.bgPrimary }}
      >
        {/* Color bars showing theme colors */}
        <div className="absolute inset-0 flex flex-col">
          {/* Primary background */}
          <div
            className="flex-1"
            style={{ backgroundColor: tokens.bgPrimary }}
          />
          {/* Secondary background bar */}
          <div
            className="h-2"
            style={{ backgroundColor: tokens.bgSecondary }}
          />
          {/* Accent color bar */}
          <div
            className="h-2"
            style={{ backgroundColor: tokens.accentPrimary }}
          />
        </div>

        {/* Text color sample */}
        <div
          className="absolute top-1 left-1.5 text-xs font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          Aa
        </div>

        {/* Accent swatch dots */}
        <div className="absolute bottom-1 right-1 flex gap-0.5">
          {theme.accentSwatches.slice(0, 3).map((swatch, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full border border-white/50"
              style={{ backgroundColor: swatch.hex }}
            />
          ))}
        </div>

        {/* Selection Checkmark */}
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center bg-accent-primary/20">
            <div className="w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center text-white text-xs shadow-md">
              ✓
            </div>
          </div>
        )}
      </div>

      {/* Theme Name */}
      <div className="text-left">
        <div className="font-medium text-xs text-text-primary truncate">{theme.name}</div>
        <div className="text-xs text-text-tertiary truncate opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
          {theme.description.length > 25 ? theme.description.slice(0, 25) + '...' : theme.description}
        </div>
      </div>
    </button>
  );
};

export default ThemeSelector;
