/**
 * Grid Layout Section Component - Gallery Design Studio
 *
 * Controls for configuring the gallery grid layout including:
 * - Grid style toggle (vertical/horizontal masonry) - T001 (completed)
 * - Thumbnail size selector (sm/md/lg) - T002 (completed)
 * - Grid spacing selector (sm/md/lg) - T003 (completed)
 * - Navigation style selector placeholder - T004
 *
 * Feature: Gallery Design Studio - Grid Layout Configuration (Phase 1)
 * Tasks: T001 - Grid style toggle, T002 - Thumbnail size selector, T003 - Grid spacing selector
 */

import React, { useCallback, useRef, useState } from 'react';
import { GridStyle, GridSize, GridSpacing, NavigationStyle, GridConfig } from '../../../../types/gallery-design';
import { DesignStudioTooltip } from './DesignStudioTooltip';
import { Check, AlignVerticalJustifyStart, AlignHorizontalJustifyStart, Image, MousePointer2, Type } from 'lucide-react';

interface GridLayoutSectionProps {
  config: GridConfig;
  onChange: (updates: Partial<GridConfig>) => void;
  disabled?: boolean;
}

// Grid style options with icons and descriptions
const GRID_STYLES: {
  id: GridStyle;
  name: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'vertical',
    name: 'Vertical',
    description: 'Classic vertical masonry with flowing columns',
    icon: <AlignVerticalJustifyStart className="w-5 h-5" />,
  },
  {
    id: 'horizontal',
    name: 'Horizontal',
    description: 'Horizontal rows with justified alignment',
    icon: <AlignHorizontalJustifyStart className="w-5 h-5" />,
  },
];

// Thumbnail size options with visual representations
const THUMBNAIL_SIZES: {
  id: GridSize;
  name: string;
  description: string;
  iconSize: string; // Tailwind size class for the icon
}[] = [
  {
    id: 'sm',
    name: 'Small',
    description: 'Compact thumbnails, more photos visible',
    iconSize: 'w-4 h-4',
  },
  {
    id: 'md',
    name: 'Medium',
    description: 'Balanced size for most galleries',
    iconSize: 'w-5 h-5',
  },
  {
    id: 'lg',
    name: 'Large',
    description: 'Showcase thumbnails with more detail',
    iconSize: 'w-6 h-6',
  },
];

// Grid spacing options with visual representations (T003)
const GRID_SPACINGS: {
  id: GridSpacing;
  name: string;
  description: string;
  gapSize: string; // Tailwind gap class for visual indicator
}[] = [
  {
    id: 'sm',
    name: 'Tight',
    description: 'Minimal gaps between photos',
    gapSize: 'gap-0.5',
  },
  {
    id: 'md',
    name: 'Normal',
    description: 'Balanced spacing for most galleries',
    gapSize: 'gap-1',
  },
  {
    id: 'lg',
    name: 'Relaxed',
    description: 'More breathing room between photos',
    gapSize: 'gap-2',
  },
];

// Navigation style options (T004)
const NAVIGATION_STYLES: {
  id: NavigationStyle;
  name: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'icon-only',
    name: 'Icons Only',
    description: 'Compact navigation with icons only',
    icon: <MousePointer2 className="w-5 h-5" />,
  },
  {
    id: 'icon-text',
    name: 'Icons + Text',
    description: 'Full navigation with icons and labels',
    icon: <Type className="w-5 h-5" />,
  },
];

export const GridLayoutSection: React.FC<GridLayoutSectionProps> = ({
  config,
  onChange,
  disabled = false,
}) => {
  const [focusedStyleIndex, setFocusedStyleIndex] = useState<number>(-1);
  const [focusedSizeIndex, setFocusedSizeIndex] = useState<number>(-1);
  const [focusedSpacingIndex, setFocusedSpacingIndex] = useState<number>(-1);
  const [focusedNavStyleIndex, setFocusedNavStyleIndex] = useState<number>(-1);
  const gridRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const spacingRef = useRef<HTMLDivElement>(null);
  const navStyleRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation within the grid style options
  const handleStyleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const totalStyles = GRID_STYLES.length;
      let newIndex = focusedStyleIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          newIndex = focusedStyleIndex < totalStyles - 1 ? focusedStyleIndex + 1 : 0;
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          newIndex = focusedStyleIndex > 0 ? focusedStyleIndex - 1 : totalStyles - 1;
          break;
        }
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = totalStyles - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedStyleIndex >= 0 && focusedStyleIndex < totalStyles) {
            onChange({ style: GRID_STYLES[focusedStyleIndex].id });
          }
          return;
        default:
          return;
      }

      setFocusedStyleIndex(newIndex);

      // Focus the new element
      const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      buttons?.[newIndex]?.focus();
    },
    [focusedStyleIndex, disabled, onChange]
  );

  // Handle keyboard navigation within the thumbnail size options
  const handleSizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const totalSizes = THUMBNAIL_SIZES.length;
      let newIndex = focusedSizeIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          newIndex = focusedSizeIndex < totalSizes - 1 ? focusedSizeIndex + 1 : 0;
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          newIndex = focusedSizeIndex > 0 ? focusedSizeIndex - 1 : totalSizes - 1;
          break;
        }
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = totalSizes - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedSizeIndex >= 0 && focusedSizeIndex < totalSizes) {
            onChange({ size: THUMBNAIL_SIZES[focusedSizeIndex].id });
          }
          return;
        default:
          return;
      }

      setFocusedSizeIndex(newIndex);

      // Focus the new element
      const buttons = sizeRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      buttons?.[newIndex]?.focus();
    },
    [focusedSizeIndex, disabled, onChange]
  );

  // Handle keyboard navigation within the grid spacing options (T003)
  const handleSpacingKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const totalSpacings = GRID_SPACINGS.length;
      let newIndex = focusedSpacingIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          newIndex = focusedSpacingIndex < totalSpacings - 1 ? focusedSpacingIndex + 1 : 0;
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          newIndex = focusedSpacingIndex > 0 ? focusedSpacingIndex - 1 : totalSpacings - 1;
          break;
        }
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = totalSpacings - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedSpacingIndex >= 0 && focusedSpacingIndex < totalSpacings) {
            onChange({ spacing: GRID_SPACINGS[focusedSpacingIndex].id });
          }
          return;
        default:
          return;
      }

      setFocusedSpacingIndex(newIndex);

      // Focus the new element
      const buttons = spacingRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      buttons?.[newIndex]?.focus();
    },
    [focusedSpacingIndex, disabled, onChange]
  );

  // Handle keyboard navigation within the navigation style options (T004)
  const handleNavStyleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const totalStyles = NAVIGATION_STYLES.length;
      let newIndex = focusedNavStyleIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          newIndex = focusedNavStyleIndex < totalStyles - 1 ? focusedNavStyleIndex + 1 : 0;
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          newIndex = focusedNavStyleIndex > 0 ? focusedNavStyleIndex - 1 : totalStyles - 1;
          break;
        }
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = totalStyles - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedNavStyleIndex >= 0 && focusedNavStyleIndex < totalStyles) {
            onChange({ navigationStyle: NAVIGATION_STYLES[focusedNavStyleIndex].id });
          }
          return;
        default:
          return;
      }

      setFocusedNavStyleIndex(newIndex);

      // Focus the new element
      const buttons = navStyleRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      buttons?.[newIndex]?.focus();
    },
    [focusedNavStyleIndex, disabled, onChange]
  );

  return (
    <div className="space-y-8">
      {/* Grid Style Toggle */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Grid orientation</h3>
          <DesignStudioTooltip content="Choose how photos flow in your gallery - vertical columns or horizontal rows">
            <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
          </DesignStudioTooltip>
        </div>
        <div
          ref={gridRef}
          role="listbox"
          aria-label="Select grid style"
          aria-activedescendant={focusedStyleIndex >= 0 ? `grid-style-${GRID_STYLES[focusedStyleIndex]?.id}` : undefined}
          className="grid grid-cols-2 gap-3"
          onKeyDown={handleStyleKeyDown}
        >
          {GRID_STYLES.map((style, index) => (
            <GridStyleOption
              key={style.id}
              style={style}
              isSelected={config.style === style.id}
              isFocused={focusedStyleIndex === index}
              onSelect={() => onChange({ style: style.id })}
              onFocus={() => setFocusedStyleIndex(index)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Thumbnail Size Selector (T002) */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Thumbnail size</h3>
          <DesignStudioTooltip content="Control the size of photo thumbnails in your gallery grid">
            <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
          </DesignStudioTooltip>
        </div>
        <div
          ref={sizeRef}
          role="listbox"
          aria-label="Select thumbnail size"
          aria-activedescendant={focusedSizeIndex >= 0 ? `thumbnail-size-${THUMBNAIL_SIZES[focusedSizeIndex]?.id}` : undefined}
          className="grid grid-cols-3 gap-3"
          onKeyDown={handleSizeKeyDown}
        >
          {THUMBNAIL_SIZES.map((size, index) => (
            <ThumbnailSizeOption
              key={size.id}
              size={size}
              isSelected={config.size === size.id}
              isFocused={focusedSizeIndex === index}
              onSelect={() => onChange({ size: size.id })}
              onFocus={() => setFocusedSizeIndex(index)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Grid Spacing Selector (T003) */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Grid spacing</h3>
          <DesignStudioTooltip content="Adjust the gap between photos in your gallery grid">
            <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
          </DesignStudioTooltip>
        </div>
        <div
          ref={spacingRef}
          role="listbox"
          aria-label="Select grid spacing"
          aria-activedescendant={focusedSpacingIndex >= 0 ? `grid-spacing-${GRID_SPACINGS[focusedSpacingIndex]?.id}` : undefined}
          className="grid grid-cols-3 gap-3"
          onKeyDown={handleSpacingKeyDown}
        >
          {GRID_SPACINGS.map((spacing, index) => (
            <GridSpacingOption
              key={spacing.id}
              spacing={spacing}
              isSelected={config.spacing === spacing.id}
              isFocused={focusedSpacingIndex === index}
              onSelect={() => onChange({ spacing: spacing.id })}
              onFocus={() => setFocusedSpacingIndex(index)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Navigation Style Selector (T004) */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Navigation style</h3>
          <DesignStudioTooltip content="Choose how navigation buttons appear in your gallery">
            <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
          </DesignStudioTooltip>
        </div>
        <div
          ref={navStyleRef}
          role="listbox"
          aria-label="Select navigation style"
          aria-activedescendant={focusedNavStyleIndex >= 0 ? `nav-style-${NAVIGATION_STYLES[focusedNavStyleIndex]?.id}` : undefined}
          className="grid grid-cols-2 gap-3"
          onKeyDown={handleNavStyleKeyDown}
        >
          {NAVIGATION_STYLES.map((navStyle, index) => (
            <NavigationStyleOption
              key={navStyle.id}
              navStyle={navStyle}
              isSelected={config.navigationStyle === navStyle.id}
              isFocused={focusedNavStyleIndex === index}
              onSelect={() => onChange({ navigationStyle: navStyle.id })}
              onFocus={() => setFocusedNavStyleIndex(index)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Individual Grid Style Option Component
 */
interface GridStyleOptionProps {
  style: (typeof GRID_STYLES)[0];
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onFocus: () => void;
  disabled?: boolean;
}

const GridStyleOption: React.FC<GridStyleOptionProps> = ({
  style,
  isSelected,
  isFocused,
  onSelect,
  onFocus,
  disabled = false,
}) => {
  return (
    <DesignStudioTooltip content={style.description} position="bottom">
      <button
        id={`grid-style-${style.id}`}
        role="option"
        aria-selected={isSelected}
        aria-label={`${style.name}: ${style.description}`}
        onClick={onSelect}
        onFocus={onFocus}
        disabled={disabled}
        className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${
          isSelected
            ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)] scale-[1.02]'
            : isFocused
              ? 'border-gray-400 dark:border-white/20 bg-gray-200 dark:bg-white/5 shadow-xl scale-[1.01]'
              : 'border-gray-300 dark:border-white/5 bg-gray-100 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:scale-[1.01]'
        } ${disabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
      >
        {/* Icon Preview Area */}
        <div
          className={`relative w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
            isSelected
              ? 'bg-cyan-400/20 text-cyan-400'
              : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-white/60 group-hover:text-gray-900 dark:group-hover:text-white/80'
          }`}
        >
          {style.icon}

          {/* Selection Checkmark */}
          {isSelected && (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-400 flex items-center justify-center shadow-md">
              <Check className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Style Name */}
        <div
          className={`text-[11px] font-semibold tracking-wide text-center transition-colors ${
            isSelected
              ? 'text-cyan-400'
              : 'text-gray-900 dark:text-white/80 group-hover:text-gray-950 dark:group-hover:text-white'
          }`}
        >
          {style.name}
        </div>

        {/* Style Description */}
        <div className="text-[9px] text-gray-600 dark:text-white/50 font-medium text-center mt-1 leading-relaxed group-hover:text-gray-700 dark:group-hover:text-white/70 transition-colors">
          {style.description}
        </div>
      </button>
    </DesignStudioTooltip>
  );
};

/**
 * Individual Thumbnail Size Option Component (T002)
 */
interface ThumbnailSizeOptionProps {
  size: (typeof THUMBNAIL_SIZES)[0];
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onFocus: () => void;
  disabled?: boolean;
}

const ThumbnailSizeOption: React.FC<ThumbnailSizeOptionProps> = ({
  size,
  isSelected,
  isFocused,
  onSelect,
  onFocus,
  disabled = false,
}) => {
  return (
    <DesignStudioTooltip content={size.description} position="bottom">
      <button
        id={`thumbnail-size-${size.id}`}
        role="option"
        aria-selected={isSelected}
        aria-label={`${size.name}: ${size.description}`}
        onClick={onSelect}
        onFocus={onFocus}
        disabled={disabled}
        className={`group relative flex flex-col items-center p-3 rounded-xl border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${
          isSelected
            ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)] scale-[1.02]'
            : isFocused
              ? 'border-gray-400 dark:border-white/20 bg-gray-200 dark:bg-white/5 shadow-xl scale-[1.01]'
              : 'border-gray-300 dark:border-white/5 bg-gray-100 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:scale-[1.01]'
        } ${disabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
      >
        {/* Icon Preview Area */}
        <div
          className={`relative flex items-center justify-center mb-2 transition-colors ${
            isSelected
              ? 'text-cyan-400'
              : 'text-gray-600 dark:text-white/60 group-hover:text-gray-900 dark:group-hover:text-white/80'
          }`}
        >
          <Image className={size.iconSize} />

          {/* Selection Checkmark */}
          {isSelected && (
            <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-cyan-400 flex items-center justify-center shadow-md">
              <Check className="w-2 h-2 text-white" />
            </div>
          )}
        </div>

        {/* Size Name */}
        <div
          className={`text-[10px] font-semibold tracking-wide text-center transition-colors ${
            isSelected
              ? 'text-cyan-400'
              : 'text-gray-900 dark:text-white/80 group-hover:text-gray-950 dark:group-hover:text-white'
          }`}
        >
          {size.name}
        </div>
      </button>
    </DesignStudioTooltip>
  );
};

/**
 * Individual Grid Spacing Option Component (T003)
 */
interface GridSpacingOptionProps {
  spacing: (typeof GRID_SPACINGS)[0];
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onFocus: () => void;
  disabled?: boolean;
}

const GridSpacingOption: React.FC<GridSpacingOptionProps> = ({
  spacing,
  isSelected,
  isFocused,
  onSelect,
  onFocus,
  disabled = false,
}) => {
  return (
    <DesignStudioTooltip content={spacing.description} position="bottom">
      <button
        id={`grid-spacing-${spacing.id}`}
        role="option"
        aria-selected={isSelected}
        aria-label={`${spacing.name}: ${spacing.description}`}
        onClick={onSelect}
        onFocus={onFocus}
        disabled={disabled}
        className={`group relative flex flex-col items-center p-3 rounded-xl border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${
          isSelected
            ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)] scale-[1.02]'
            : isFocused
              ? 'border-gray-400 dark:border-white/20 bg-gray-200 dark:bg-white/5 shadow-xl scale-[1.01]'
              : 'border-gray-300 dark:border-white/5 bg-gray-100 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:scale-[1.01]'
        } ${disabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
      >
        {/* Visual Spacing Indicator */}
        <div
          className={`relative flex items-center justify-center mb-2 transition-colors ${
            isSelected
              ? 'text-cyan-400'
              : 'text-gray-600 dark:text-white/60 group-hover:text-gray-900 dark:group-hover:text-white/80'
          }`}
        >
          {/* Grid representation showing spacing */}
          <div className={`grid grid-cols-2 ${spacing.gapSize}`}>
            <div className={`w-2.5 h-2.5 rounded-sm ${isSelected ? 'bg-cyan-400' : 'bg-gray-400 dark:bg-white/40 group-hover:bg-gray-600 dark:group-hover:bg-white/60'}`} />
            <div className={`w-2.5 h-2.5 rounded-sm ${isSelected ? 'bg-cyan-400' : 'bg-gray-400 dark:bg-white/40 group-hover:bg-gray-600 dark:group-hover:bg-white/60'}`} />
            <div className={`w-2.5 h-2.5 rounded-sm ${isSelected ? 'bg-cyan-400' : 'bg-gray-400 dark:bg-white/40 group-hover:bg-gray-600 dark:group-hover:bg-white/60'}`} />
            <div className={`w-2.5 h-2.5 rounded-sm ${isSelected ? 'bg-cyan-400' : 'bg-gray-400 dark:bg-white/40 group-hover:bg-gray-600 dark:group-hover:bg-white/60'}`} />
          </div>

          {/* Selection Checkmark */}
          {isSelected && (
            <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-cyan-400 flex items-center justify-center shadow-md">
              <Check className="w-2 h-2 text-white" />
            </div>
          )}
        </div>

        {/* Spacing Name */}
        <div
          className={`text-[10px] font-semibold tracking-wide text-center transition-colors ${
            isSelected
              ? 'text-cyan-400'
              : 'text-gray-900 dark:text-white/80 group-hover:text-gray-950 dark:group-hover:text-white'
          }`}
        >
          {spacing.name}
        </div>
      </button>
    </DesignStudioTooltip>
  );
};

/**
 * Individual Navigation Style Option Component (T004)
 */
interface NavigationStyleOptionProps {
  navStyle: (typeof NAVIGATION_STYLES)[0];
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onFocus: () => void;
  disabled?: boolean;
}

const NavigationStyleOption: React.FC<NavigationStyleOptionProps> = ({
  navStyle,
  isSelected,
  isFocused,
  onSelect,
  onFocus,
  disabled = false,
}) => {
  return (
    <DesignStudioTooltip content={navStyle.description} position="bottom">
      <button
        id={`nav-style-${navStyle.id}`}
        role="option"
        aria-selected={isSelected}
        aria-label={`${navStyle.name}: ${navStyle.description}`}
        onClick={onSelect}
        onFocus={onFocus}
        disabled={disabled}
        className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${
          isSelected
            ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)] scale-[1.02]'
            : isFocused
              ? 'border-gray-400 dark:border-white/20 bg-gray-200 dark:bg-white/5 shadow-xl scale-[1.01]'
              : 'border-gray-300 dark:border-white/5 bg-gray-100 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:scale-[1.01]'
        } ${disabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
      >
        {/* Icon Preview Area */}
        <div
          className={`relative w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-colors ${
            isSelected
              ? 'bg-cyan-400/20 text-cyan-400'
              : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-white/60 group-hover:text-gray-900 dark:group-hover:text-white/80'
          }`}
        >
          {navStyle.icon}

          {/* Selection Checkmark */}
          {isSelected && (
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-400 flex items-center justify-center shadow-md">
              <Check className="w-2 h-2 text-white" />
            </div>
          )}
        </div>

        {/* Navigation Style Name */}
        <div
          className={`text-[10px] font-semibold tracking-wide text-center transition-colors ${
            isSelected
              ? 'text-cyan-400'
              : 'text-gray-900 dark:text-white/80 group-hover:text-gray-950 dark:group-hover:text-white'
          }`}
        >
          {navStyle.name}
        </div>
      </button>
    </DesignStudioTooltip>
  );
};

export default GridLayoutSection;
