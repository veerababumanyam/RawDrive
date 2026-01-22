/**
 * ColorLabelIndicator Component
 * Color label display and selector for Pro Review Mode
 * Feature: 029-pro-review-xmp-sync
 *
 * Color labels (matching Lightroom):
 * - None
 * - Red (6)
 * - Yellow (7)
 * - Green (8)
 * - Blue (9)
 * - Purple
 */

import React, { useCallback } from 'react';
import { Check } from 'lucide-react';
import type { ColorLabel } from '../../../../types/reviewMode';
import { COLOR_LABEL_CONFIG } from '../../../../types/reviewMode';

export interface ColorLabelIndicatorProps {
  /** Current color label */
  colorLabel: ColorLabel;
  /** Callback when color label changes */
  onChange?: (label: ColorLabel) => void;
  /** Whether the label can be changed */
  readOnly?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show as selector (all options) or badge (current only) */
  variant?: 'selector' | 'badge';
  /** Show keyboard shortcut hints */
  showShortcuts?: boolean;
  /** Custom className */
  className?: string;
}

// Size configurations
const SIZE_CONFIG = {
  sm: { dot: 'w-3 h-3', gap: 'gap-1' },
  md: { dot: 'w-4 h-4', gap: 'gap-1.5' },
  lg: { dot: 'w-5 h-5', gap: 'gap-2' },
};

// Keyboard shortcuts for color labels
const COLOR_SHORTCUTS: Partial<Record<ColorLabel, string>> = {
  red: '6',
  yellow: '7',
  green: '8',
  blue: '9',
};

/**
 * ColorLabelIndicator - Color label display and selector
 */
export const ColorLabelIndicator: React.FC<ColorLabelIndicatorProps> = ({
  colorLabel,
  onChange,
  readOnly = false,
  size = 'md',
  variant = 'selector',
  showShortcuts = false,
  className = '',
}) => {
  const config = SIZE_CONFIG[size];

  const handleChange = useCallback((label: ColorLabel) => {
    if (readOnly || !onChange) return;
    // Toggle off if clicking the same label
    onChange(label === colorLabel ? 'none' : label);
  }, [colorLabel, onChange, readOnly]);

  // Badge variant (current label only)
  if (variant === 'badge') {
    return <ColorLabelBadge colorLabel={colorLabel} className={className} />;
  }

  // Selector variant (all options)
  return (
    <div
      className={`
        inline-flex items-center ${config.gap}
        rounded-lg p-1
        ${readOnly ? '' : 'bg-surface-hover/50'}
        ${className}
      `}
      role="group"
      aria-label="Color label"
    >
      {/* None option */}
      <button
        type="button"
        onClick={() => handleChange('none')}
        disabled={readOnly}
        className={`
          ${config.dot}
          rounded-full border-2
          transition-all duration-150
          ${colorLabel === 'none'
            ? 'border-text-primary bg-surface-hover'
            : 'border-border hover:border-text-tertiary bg-transparent'
          }
          ${readOnly ? 'cursor-default' : 'cursor-pointer'}
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
          flex items-center justify-center
        `}
        aria-label="No color label"
        aria-pressed={colorLabel === 'none'}
      >
        {colorLabel === 'none' && <Check size={size === 'sm' ? 8 : size === 'md' ? 10 : 12} className="text-text-primary" />}
      </button>

      {/* Color options */}
      {(['red', 'yellow', 'green', 'blue', 'purple'] as ColorLabel[]).map((label) => {
        const isActive = colorLabel === label;
        const labelConfig = COLOR_LABEL_CONFIG[label];
        const shortcut = COLOR_SHORTCUTS[label];

        return (
          <button
            key={label}
            type="button"
            onClick={() => handleChange(label)}
            disabled={readOnly}
            className={`
              relative ${config.dot}
              rounded-full
              transition-all duration-150
              ${labelConfig.bgColor}
              ${isActive
                ? 'ring-2 ring-white ring-offset-1 ring-offset-black scale-110'
                : 'opacity-60 hover:opacity-100'
              }
              ${readOnly ? 'cursor-default' : 'cursor-pointer'}
              focus:outline-none focus-visible:ring-2 focus-visible:ring-white
              flex items-center justify-center
            `}
            aria-label={`${labelConfig.label}${shortcut ? ` (${shortcut})` : ''}`}
            aria-pressed={isActive}
          >
            {isActive && (
              <Check size={size === 'sm' ? 8 : size === 'md' ? 10 : 12} className="text-white drop-shadow" />
            )}

            {/* Shortcut hint */}
            {showShortcuts && shortcut && !readOnly && (
              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-text-tertiary">
                {shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/**
 * ColorLabelBadge - Compact color label badge for overlays
 */
export const ColorLabelBadge: React.FC<{
  colorLabel: ColorLabel;
  className?: string;
}> = ({ colorLabel, className = '' }) => {
  if (colorLabel === 'none') return null;

  const config = COLOR_LABEL_CONFIG[colorLabel];

  return (
    <div
      className={`
        w-3 h-3 rounded-full
        ${config.bgColor}
        ${className}
      `}
      title={config.label}
      aria-label={`Color label: ${config.label}`}
    />
  );
};

/**
 * ColorLabelDot - Single color dot
 */
export const ColorLabelDot: React.FC<{
  colorLabel: ColorLabel;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ colorLabel, size = 'sm', className = '' }) => {
  if (colorLabel === 'none') return null;

  const config = COLOR_LABEL_CONFIG[colorLabel];
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <div
      className={`
        ${sizeConfig.dot}
        rounded-full
        ${config.bgColor}
        ${className}
      `}
      title={config.label}
    />
  );
};

export default ColorLabelIndicator;
