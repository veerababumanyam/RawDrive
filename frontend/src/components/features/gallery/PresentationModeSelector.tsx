/**
 * PresentationModeSelector Component
 * UI for selecting between different gallery presentation modes.
 *
 * Features:
 * - Mode selection (Grid, Masonry, Timeline, Cinematic)
 * - Visual previews of each mode
 * - Smooth transitions between modes
 * - Keyboard accessible
 * - Remembers user preference
 *
 * @module gallery/PresentationModeSelector
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Grid,
  LayoutGrid,
  Clock,
  Film,
  ChevronDown,
  Check,
  Tv2,
  Sparkles,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

// ============================================================================
// Types
// ============================================================================

export type PresentationMode = 'grid' | 'masonry' | 'timeline' | 'cinematic' | 'ambient';

export interface PresentationModeOption {
  id: PresentationMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  premium?: boolean;
}

export interface PresentationModeSelectorProps {
  /** Current active mode */
  value: PresentationMode;
  /** Callback when mode changes */
  onChange: (mode: PresentationMode) => void;
  /** Available modes */
  availableModes?: PresentationMode[];
  /** Show mode descriptions */
  showDescriptions?: boolean;
  /** Display variant */
  variant?: 'dropdown' | 'tabs' | 'icons';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom class name */
  className?: string;
  /** Disable cinematic/ambient modes (e.g., for small galleries) */
  disableCinematic?: boolean;
  /** Show TV/ambient mode button separately */
  showAmbientButton?: boolean;
  /** Callback when ambient mode is triggered */
  onAmbientModeClick?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const PRESENTATION_MODES: PresentationModeOption[] = [
  {
    id: 'grid',
    label: 'Grid',
    description: 'Classic uniform grid layout',
    icon: Grid,
  },
  {
    id: 'masonry',
    label: 'Masonry',
    description: 'Pinterest-style with natural aspect ratios',
    icon: LayoutGrid,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Chronological story view',
    icon: Clock,
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Full-screen slideshow experience',
    icon: Film,
    premium: true,
  },
  {
    id: 'ambient',
    label: 'TV Mode',
    description: 'Ambient display for big screens',
    icon: Tv2,
    premium: true,
  },
];

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Mode option button for dropdown/list view
 */
const ModeOption: React.FC<{
  option: PresentationModeOption;
  isSelected: boolean;
  onClick: () => void;
  showDescription: boolean;
}> = ({ option, isSelected, onClick, showDescription }) => {
  const Icon = option.icon;

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
        ${isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-surface-hover'}
      `}
      role="option"
      aria-selected={isSelected}
    >
      <div className={`
        flex-shrink-0 p-2 rounded-lg
        ${isSelected ? 'bg-primary-100 dark:bg-primary-800' : 'bg-surface-secondary'}
      `}>
        <Icon className={`
          w-5 h-5
          ${isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-text-secondary'}
        `} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`
            font-medium
            ${isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-text-primary'}
          `}>
            {option.label}
          </span>
          {option.premium && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded">
              <Sparkles className="w-3 h-3" />
              Premium
            </span>
          )}
        </div>
        {showDescription && (
          <p className="text-sm text-text-secondary truncate">{option.description}</p>
        )}
      </div>

      {isSelected && (
        <Check className="w-5 h-5 text-primary-500 flex-shrink-0" />
      )}
    </button>
  );
};

/**
 * Tab-style mode button
 */
const ModeTab: React.FC<{
  option: PresentationModeOption;
  isSelected: boolean;
  onClick: () => void;
  size: 'sm' | 'md' | 'lg';
}> = ({ option, isSelected, onClick, size }) => {
  const Icon = option.icon;

  const sizeClasses = {
    sm: 'px-2 py-1.5 text-xs gap-1.5',
    md: 'px-3 py-2 text-sm gap-2',
    lg: 'px-4 py-2.5 text-base gap-2.5',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center ${sizeClasses[size]} rounded-lg font-medium transition-all
        ${isSelected
          ? 'text-primary-600 dark:text-primary-400'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }
      `}
      role="tab"
      aria-selected={isSelected}
    >
      <Icon className={iconSizes[size]} />
      <span>{option.label}</span>

      {isSelected && (
        <motion.div
          layoutId="presentation-mode-indicator"
          className="absolute inset-0 bg-primary-50 dark:bg-primary-900/20 rounded-lg -z-10"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </button>
  );
};

/**
 * Icon-only mode button
 */
const ModeIcon: React.FC<{
  option: PresentationModeOption;
  isSelected: boolean;
  onClick: () => void;
  size: 'sm' | 'md' | 'lg';
}> = ({ option, isSelected, onClick, size }) => {
  const Icon = option.icon;

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <button
      onClick={onClick}
      className={`
        relative ${sizeClasses[size]} rounded-lg transition-all
        ${isSelected
          ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }
      `}
      title={option.label}
      aria-label={option.label}
    >
      <Icon className={iconSizes[size]} />
    </button>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const PresentationModeSelector: React.FC<PresentationModeSelectorProps> = ({
  value,
  onChange,
  availableModes = ['grid', 'masonry', 'timeline', 'cinematic'],
  showDescriptions = true,
  variant = 'dropdown',
  size = 'md',
  className = '',
  disableCinematic = false,
  showAmbientButton = false,
  onAmbientModeClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Filter available modes
  const modes = PRESENTATION_MODES.filter((mode) => {
    if (!availableModes.includes(mode.id)) return false;
    if (disableCinematic && (mode.id === 'cinematic' || mode.id === 'ambient')) return false;
    return true;
  });

  const selectedMode = modes.find((m) => m.id === value) || modes[0];

  const handleSelect = useCallback(
    (mode: PresentationMode) => {
      onChange(mode);
      setIsOpen(false);
    },
    [onChange]
  );

  // Dropdown variant
  if (variant === 'dropdown') {
    const Icon = selectedMode.icon;

    return (
      <div className={`relative ${className}`}>
        {/* Trigger button */}
        <AppButton
          variant="outline"
          size={size}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <Icon className="w-4 h-4" />
          <span>{selectedMode.label}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </AppButton>

        {/* Dropdown menu */}
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
              />

              {/* Menu */}
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 z-50 w-72 bg-surface rounded-xl border border-border shadow-xl overflow-hidden"
                role="listbox"
              >
                {modes.map((option) => (
                  <ModeOption
                    key={option.id}
                    option={option}
                    isSelected={option.id === value}
                    onClick={() => handleSelect(option.id)}
                    showDescription={showDescriptions}
                  />
                ))}

                {/* Ambient mode button */}
                {showAmbientButton && onAmbientModeClick && (
                  <>
                    <div className="border-t border-border" />
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        onAmbientModeClick();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex-shrink-0 p-2 rounded-lg bg-gradient-to-br from-primary-500 to-violet-500">
                        <Tv2 className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">Cast to TV</span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded">
                            <Sparkles className="w-3 h-3" />
                            New
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary">
                          Display on your Smart TV
                        </p>
                      </div>
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Tabs variant
  if (variant === 'tabs') {
    return (
      <div
        className={`inline-flex items-center gap-1 p-1 bg-surface-secondary rounded-xl ${className}`}
        role="tablist"
      >
        {modes.map((option) => (
          <ModeTab
            key={option.id}
            option={option}
            isSelected={option.id === value}
            onClick={() => handleSelect(option.id)}
            size={size}
          />
        ))}

        {/* Separate ambient button */}
        {showAmbientButton && onAmbientModeClick && (
          <>
            <div className="w-px h-6 bg-border mx-1" />
            <button
              onClick={onAmbientModeClick}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all
                text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20
              `}
              title="Cast to TV"
            >
              <Tv2 className="w-4 h-4" />
              <span className="text-sm">TV</span>
            </button>
          </>
        )}
      </div>
    );
  }

  // Icons variant
  return (
    <div
      className={`inline-flex items-center gap-1 p-1 bg-surface-secondary rounded-lg ${className}`}
      role="tablist"
    >
      {modes.map((option) => (
        <ModeIcon
          key={option.id}
          option={option}
          isSelected={option.id === value}
          onClick={() => handleSelect(option.id)}
          size={size}
        />
      ))}

      {/* Separate ambient button */}
      {showAmbientButton && onAmbientModeClick && (
        <>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button
            onClick={onAmbientModeClick}
            className="p-2 rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all"
            title="Cast to TV"
          >
            <Tv2 className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
};

export default PresentationModeSelector;
