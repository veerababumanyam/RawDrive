/**
 * GradientThumbnail Component
 * Displays a small visual preview of a gradient preset for selection grids.
 * Used within GradientPicker to show selectable gradient options.
 *
 * Features:
 * - Renders actual gradient as background
 * - Hover state with scale transform
 * - Selected state with border highlight and checkmark
 * - Keyboard accessible (focusable, Enter/Space to select)
 * - Tooltip support for gradient name
 */

import React, { useCallback } from 'react';
import { Check } from 'lucide-react';
import { gradientToCss } from '../../../utils/gradientUtils';
import type { GradientConfiguration } from '../../../types/gradient';

export interface GradientThumbnailProps {
  /** The gradient configuration to display */
  config: GradientConfiguration;
  /** Display name for the gradient (shown in tooltip) */
  name: string;
  /** Whether this gradient is currently selected */
  isSelected?: boolean;
  /** Callback when the gradient is clicked/selected */
  onSelect?: () => void;
  /** Optional size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Optional className for additional styling */
  className?: string;
  /** Whether the thumbnail is disabled */
  disabled?: boolean;
}

const sizeClasses = {
  sm: 'w-10 h-10',
  md: 'w-14 h-14',
  lg: 'w-20 h-20',
};

export const GradientThumbnail: React.FC<GradientThumbnailProps> = ({
  config,
  name,
  isSelected = false,
  onSelect,
  size = 'md',
  className = '',
  disabled = false,
}) => {
  const handleClick = useCallback(() => {
    if (!disabled && onSelect) {
      onSelect();
    }
  }, [disabled, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!disabled && onSelect && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onSelect();
      }
    },
    [disabled, onSelect]
  );

  const gradientStyle = {
    background: gradientToCss(config),
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      title={name}
      aria-label={`Select ${name} gradient`}
      aria-pressed={isSelected}
      className={`
        relative rounded-lg overflow-hidden
        ${sizeClasses[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        transition-all duration-200 ease-out
        focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface
        ${
          isSelected
            ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface scale-105'
            : 'ring-1 ring-border hover:ring-accent/50 hover:scale-105 hover:shadow-md'
        }
        ${className}
      `}
      style={gradientStyle}
    >
      {/* Selection checkmark overlay */}
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg">
            <Check size={14} className="text-accent" strokeWidth={3} />
          </div>
        </div>
      )}

      {/* Hover overlay for non-selected state */}
      {!isSelected && !disabled && (
        <div className="absolute inset-0 bg-white/0 hover:bg-white/10 transition-colors duration-200" />
      )}
    </button>
  );
};

export default GradientThumbnail;
