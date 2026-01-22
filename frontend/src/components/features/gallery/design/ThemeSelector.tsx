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
import { DesignStudioTooltip } from './DesignStudioTooltip';
import { Check } from 'lucide-react';

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
    <div className="space-y-8">
      {/* Theme Grid - Bento Layout */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Color atmosphere</h3>
          <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help" title="Choose the color palette that sets the mood for your gallery">ⓘ</span>
        </div>
        <div
          ref={gridRef}
          role="listbox"
          aria-label="Select gallery theme"
          aria-activedescendant={focusedIndex >= 0 ? `theme-${THEME_LIST[focusedIndex]?.id}` : undefined}
          className="grid grid-cols-3 gap-3"
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
      <div className="pt-4 border-t border-gray-200 dark:border-white/5">
        <div className="flex items-center gap-2 mb-4">
          <h4 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Luminance mode</h4>
          <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help" title="Choose light or dark theme for your gallery">ⓘ</span>
        </div>
        <div className="flex bg-gray-100 dark:bg-black/30 backdrop-blur-md rounded-2xl p-1.5 border border-gray-200 dark:border-white/5" role="radiogroup" aria-label="Theme mode">
          {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              role="radio"
              aria-checked={selectedMode === mode}
              onClick={() => onModeChange(mode)}
              disabled={disabled}
              className={`flex-1 py-2 rounded-xl text-[10px] font-semibold tracking-wide transition-all duration-300 capitalize focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${selectedMode === mode
                ? 'bg-white text-[#0a1628] shadow-lg scale-[1.02]'
                : 'text-gray-600 dark:text-white/40 hover:text-gray-900 dark:hover:text-white/70 hover:bg-gray-200 dark:hover:bg-white/5 hover:scale-[1.01]'
                } ${disabled ? 'opacity-20 cursor-not-allowed' : ''}`}
            >
              {mode}
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
    <DesignStudioTooltip content={theme.description} position="right">
      <button
        id={`theme-${theme.id}`}
        role="option"
        aria-selected={isSelected}
        aria-label={`${theme.name}: ${theme.description}`}
        onClick={onSelect}
        onFocus={onFocus}
        disabled={disabled}
        className={`group relative flex flex-col p-2.5 rounded-2xl border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${isSelected
          ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)] scale-[1.02]'
          : isFocused
            ? 'border-gray-400 dark:border-white/20 bg-gray-200 dark:bg-white/5 shadow-xl scale-[1.01]'
            : 'border-gray-300 dark:border-white/5 bg-gray-100 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:scale-[1.01]'
          } ${disabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
      >
        {/* Color Swatch Preview */}
        <div
          className="relative aspect-square rounded-xl overflow-hidden mb-3 shadow-inner"
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
              <div className="w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center shadow-md">
                <Check className="w-3 h-3 text-white" />
              </div>
            </div>
          )}
        </div>

        {/* Theme Name - Centered Alignment */}
        <div className="flex flex-col items-center px-1">
          <div className={`text-[10px] font-semibold tracking-wide text-center transition-colors ${isSelected ? 'text-cyan-400' : 'text-gray-900 dark:text-white/80 group-hover:text-gray-950 dark:group-hover:text-white'}`}>
            {theme.name}
          </div>
          <div className="text-[9px] text-gray-600 dark:text-white/50 font-medium truncate mt-0.5 text-center group-hover:text-gray-700 dark:group-hover:text-white/70 transition-colors">
            {theme.description}
          </div>
        </div>
      </button>
    </DesignStudioTooltip >
  );
};

export default ThemeSelector;
