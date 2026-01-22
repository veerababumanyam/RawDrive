/**
 * FlagIndicator Component
 * Flag status display and toggle for Pro Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T024
 *
 * Flag types:
 * - Pick (P): White flag on primary background
 * - Unflagged (U): Dimmed/neutral
 * - Reject (X): White X on red background
 */

import React, { useCallback } from 'react';
import { Flag, X, Minus, Check } from 'lucide-react';
import type { AssetFlag } from '../../../../types/reviewMode';
import { FLAG_CONFIG } from '../../../../types/reviewMode';

export interface FlagIndicatorProps {
  /** Current flag value */
  flag: AssetFlag;
  /** Callback when flag changes */
  onChange?: (flag: AssetFlag) => void;
  /** Whether the flag can be changed */
  readOnly?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show keyboard shortcut hints */
  showShortcuts?: boolean;
  /** Show as button group (all three options) */
  showAllOptions?: boolean;
  /** Custom className */
  className?: string;
}

// Size configurations
const SIZE_CONFIG = {
  sm: {
    iconSize: 14,
    padding: 'px-1.5 py-0.5',
    text: 'text-xs',
  },
  md: {
    iconSize: 18,
    padding: 'px-2 py-1',
    text: 'text-sm',
  },
  lg: {
    iconSize: 24,
    padding: 'px-3 py-1.5',
    text: 'text-base',
  },
};

// Flag icons
const FLAG_ICONS: Record<AssetFlag, React.FC<{ size: number; className?: string }>> = {
  pick: ({ size, className }) => <Flag size={size} className={className} />,
  unflagged: ({ size, className }) => <Minus size={size} className={className} />,
  reject: ({ size, className }) => <X size={size} className={className} />,
};

/**
 * FlagIndicator - Flag status display and toggle
 */
export const FlagIndicator: React.FC<FlagIndicatorProps> = ({
  flag,
  onChange,
  readOnly = false,
  size = 'md',
  showShortcuts = false,
  showAllOptions = false,
  className = '',
}) => {
  const config = SIZE_CONFIG[size];

  const handleFlagChange = useCallback((newFlag: AssetFlag) => {
    if (readOnly || !onChange) return;
    onChange(newFlag);
  }, [readOnly, onChange]);

  // Show all three options as button group
  if (showAllOptions) {
    return (
      <div
        className={`
          inline-flex items-center
          rounded-lg
          border border-border/50
          overflow-hidden
          ${className}
        `}
        role="group"
        aria-label="Flag status"
      >
        {(['pick', 'unflagged', 'reject'] as AssetFlag[]).map((flagOption) => {
          const isActive = flag === flagOption;
          const Icon = FLAG_ICONS[flagOption];
          const flagConfig = FLAG_CONFIG[flagOption];

          return (
            <button
              key={flagOption}
              type="button"
              onClick={() => handleFlagChange(flagOption)}
              disabled={readOnly}
              className={`
                ${config.padding}
                transition-all duration-150
                flex items-center gap-1
                ${readOnly ? 'cursor-default' : 'cursor-pointer'}
                ${isActive
                  ? flagOption === 'pick'
                    ? 'bg-primary text-white'
                    : flagOption === 'reject'
                      ? 'bg-red-600 text-white'
                      : 'bg-surface-hover text-text-primary'
                  : 'bg-surface hover:bg-surface-hover text-text-tertiary'
                }
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                border-r border-border/50 last:border-r-0
              `}
              aria-label={`${flagConfig.label}${showShortcuts ? ` (${flagOption === 'pick' ? 'P' : flagOption === 'unflagged' ? 'U' : 'X'})` : ''}`}
              aria-pressed={isActive}
            >
              <Icon size={config.iconSize} className={isActive ? '' : 'opacity-50'} />
              {size !== 'sm' && (
                <span className={`${config.text} font-medium`}>
                  {flagConfig.label}
                </span>
              )}
              {showShortcuts && (
                <span className="text-[10px] opacity-70">
                  {flagOption === 'pick' ? 'P' : flagOption === 'unflagged' ? 'U' : 'X'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Single flag badge (current state only)
  const Icon = FLAG_ICONS[flag];
  const flagConfig = FLAG_CONFIG[flag];

  return (
    <button
      type="button"
      onClick={() => {
        if (readOnly || !onChange) return;
        // Cycle through: unflagged -> pick -> reject -> unflagged
        const next: AssetFlag =
          flag === 'unflagged' ? 'pick' :
          flag === 'pick' ? 'reject' : 'unflagged';
        onChange(next);
      }}
      disabled={readOnly}
      className={`
        inline-flex items-center gap-1
        ${config.padding}
        rounded-md
        transition-all duration-150
        ${readOnly ? 'cursor-default' : 'cursor-pointer'}
        ${flag === 'pick'
          ? 'bg-primary text-white hover:bg-primary-hover'
          : flag === 'reject'
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-surface-hover text-text-tertiary hover:bg-surface-hover/80'
        }
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
        ${className}
      `}
      aria-label={`Flag: ${flagConfig.label}`}
    >
      <Icon size={config.iconSize} />
      {size !== 'sm' && (
        <span className={`${config.text} font-medium`}>{flagConfig.label}</span>
      )}
    </button>
  );
};

/**
 * Compact flag badge for thumbnail overlays
 */
export const FlagBadge: React.FC<{
  flag: AssetFlag;
  className?: string;
}> = ({ flag, className = '' }) => {
  // Don't show badge for unflagged
  if (flag === 'unflagged') return null;

  const Icon = FLAG_ICONS[flag];

  return (
    <div
      className={`
        inline-flex items-center justify-center
        w-5 h-5
        rounded-full
        ${flag === 'pick'
          ? 'bg-primary text-white'
          : 'bg-red-600 text-white'
        }
        ${className}
      `}
      aria-label={`${FLAG_CONFIG[flag].label}`}
    >
      <Icon size={12} />
    </div>
  );
};

/**
 * Flag icon only (minimal display)
 */
export const FlagIcon: React.FC<{
  flag: AssetFlag;
  size?: number;
  className?: string;
}> = ({ flag, size = 16, className = '' }) => {
  const Icon = FLAG_ICONS[flag];

  return (
    <Icon
      size={size}
      className={`
        ${flag === 'pick'
          ? 'text-primary'
          : flag === 'reject'
            ? 'text-red-600'
            : 'text-text-tertiary'
        }
        ${className}
      `}
    />
  );
};

export default FlagIndicator;
