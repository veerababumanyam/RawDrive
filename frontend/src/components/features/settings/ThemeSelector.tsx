/**
 * Theme Selector Component
 *
 * Displays available themes in a grid layout with:
 * - Category tabs/filters
 * - Theme preview thumbnails
 * - Active theme indicator
 * - Search functionality
 * - Light/dark mode toggle for theme previews
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.12, 7.13
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Palette,
  Sparkles,
  Layout,
  Zap,
  Triangle,
  Search,
  Check,
  Star,
  Crown,
  Sun,
  Moon,
  X,
  Rainbow,
  Leaf,
} from 'lucide-react';

import { AppButton } from '../../ui/AppButton';
import type { Theme, ThemeCategory } from '../../../types/profileEditor';
import {
  PREBUILT_THEMES,
  getThemesByCategory,
  searchThemes,
  getPopularThemes,
  THEME_CATEGORY_INFO,
} from '../../../constants/themes';

// =============================================================================
// Types
// =============================================================================

interface ThemeSelectorProps {
  /** Currently selected theme ID */
  selectedThemeId?: string;
  /** Callback when a theme is selected */
  onSelect: (theme: Theme) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Show compact version */
  compact?: boolean;
}

interface ThemeCardProps {
  theme: Theme;
  isSelected: boolean;
  previewVariant: 'light' | 'dark';
  onSelect: () => void;
  disabled?: boolean;
}

// =============================================================================
// Category Icons
// =============================================================================

const CATEGORY_ICONS: Record<ThemeCategory, React.ReactNode> = {
  minimal: <Layout className="w-4 h-4" />,
  bold: <Zap className="w-4 h-4" />,
  elegant: <Sparkles className="w-4 h-4" />,
  modern: <Triangle className="w-4 h-4" />,
  creative: <Palette className="w-4 h-4" />,
  gradient: <Rainbow className="w-4 h-4" />,
  dark: <Moon className="w-4 h-4" />,
  nature: <Leaf className="w-4 h-4" />,
};

// =============================================================================
// Security Utilities
// =============================================================================

const VALID_GRADIENT_DIRECTIONS = new Set([
  '0deg', '45deg', '90deg', '135deg', '180deg', '225deg', '270deg', '315deg',
  'to top', 'to right', 'to bottom', 'to left',
  'to top right', 'to top left', 'to bottom right', 'to bottom left',
]);

/**
 * Validates and sanitizes CSS color values to prevent CSS injection
 */
function isValidCssColor(color: string): boolean {
  // Allow hex colors (3, 4, 6, or 8 characters)
  if (/^#[0-9A-Fa-f]{3,8}$/.test(color)) return true;
  // Allow rgb/rgba/hsl/hsla
  if (/^(rgb|hsl)a?\(\s*[\d.%,\s]+\)$/.test(color)) return true;
  // Allow named colors (basic set)
  const namedColors = new Set(['transparent', 'inherit', 'currentColor']);
  return namedColors.has(color);
}

/**
 * Sanitizes gradient direction to prevent CSS injection
 */
function sanitizeGradientDirection(direction: string | undefined): string {
  if (!direction) return '135deg';
  return VALID_GRADIENT_DIRECTIONS.has(direction) ? direction : '135deg';
}

/**
 * Sanitizes gradient stops to ensure only valid colors are used
 */
function sanitizeGradientStops(stops: string[] | undefined): string[] {
  if (!stops || stops.length === 0) return ['#000000', '#ffffff'];
  return stops.filter(isValidCssColor).slice(0, 5); // Limit to 5 stops
}

// =============================================================================
// Theme Card Component
// =============================================================================

const ThemeCard = React.memo<ThemeCardProps>(({
  theme,
  isSelected,
  previewVariant,
  onSelect,
  disabled,
}) => {
  // Get variant-specific colors
  const variant = theme.variants?.find((v) => v.name.toLowerCase() === previewVariant);
  const variantColors = variant?.colors || {
    background: previewVariant === 'dark' ? '#0f0f0f' : '#ffffff',
    surface: previewVariant === 'dark' ? '#1a1a1a' : '#fafafa',
    text_primary: previewVariant === 'dark' ? '#ffffff' : '#1a1a1a',
    text_secondary: previewVariant === 'dark' ? '#a3a3a3' : '#6b7280',
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`
        relative group w-full text-left rounded-2xl overflow-hidden
        transition-all duration-300 ease-out
        ${isSelected
          ? 'ring-2 ring-primary ring-offset-2 shadow-lg shadow-primary/10 scale-[1.02]'
          : 'glass-card-hover hover:shadow-lg hover:-translate-y-0.5'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      aria-label={`Select ${theme.name} theme`}
      aria-pressed={isSelected}
    >
      {/* Theme Preview */}
      <div
        className="aspect-[4/3] relative overflow-hidden"
        style={{ backgroundColor: variantColors.background }}
      >
        {/* Simulated profile card preview */}
        <div className="absolute inset-3 flex flex-col gap-2">
          {/* Header simulation */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full"
              style={{ backgroundColor: theme.base_colors.primary }}
            />
            <div className="flex-1 space-y-1">
              <div
                className="h-2.5 w-3/4 rounded"
                style={{ backgroundColor: variantColors.text_primary, opacity: 0.8 }}
              />
              <div
                className="h-2 w-1/2 rounded"
                style={{ backgroundColor: variantColors.text_secondary, opacity: 0.5 }}
              />
            </div>
          </div>

          {/* Content simulation */}
          <div
            className="flex-1 rounded-lg p-2 space-y-1.5"
            style={{ backgroundColor: variantColors.surface }}
          >
            <div
              className="h-2 w-full rounded"
              style={{ backgroundColor: variantColors.text_secondary, opacity: 0.3 }}
            />
            <div
              className="h-2 w-4/5 rounded"
              style={{ backgroundColor: variantColors.text_secondary, opacity: 0.3 }}
            />
            <div
              className="h-2 w-3/5 rounded"
              style={{ backgroundColor: variantColors.text_secondary, opacity: 0.3 }}
            />
          </div>

          {/* Button simulation */}
          <div
            className="h-6 rounded-md"
            style={{
              background: theme.base_colors.gradients?.[0]
                ? `linear-gradient(${sanitizeGradientDirection(theme.base_colors.gradients[0].direction)}, ${sanitizeGradientStops(theme.base_colors.gradients[0].stops).join(', ')})`
                : (isValidCssColor(theme.base_colors.accent) ? theme.base_colors.accent : '#06B6D4'),
            }}
          />
        </div>

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Premium badge */}
        {theme.is_premium && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-gold/90 text-white text-[10px] font-medium flex items-center gap-0.5">
            <Crown className="w-3 h-3" />
            <span>Pro</span>
          </div>
        )}

        {/* Popular badge */}
        {theme.is_popular && !theme.is_premium && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-accent/90 text-white text-[10px] font-medium flex items-center gap-0.5">
            <Star className="w-3 h-3" />
            <span>Popular</span>
          </div>
        )}
      </div>

      {/* Theme Info */}
      <div className="p-3 bg-surface">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-text-primary text-sm truncate">{theme.name}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-text-tertiary capitalize">
            {theme.category}
          </span>
        </div>
        <p className="text-[11px] text-text-tertiary mt-0.5 line-clamp-1">
          {theme.description}
        </p>
      </div>
    </button>
  );
});

ThemeCard.displayName = 'ThemeCard';

// =============================================================================
// Theme Selector Component
// =============================================================================

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedThemeId,
  onSelect,
  disabled = false,
  compact = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<ThemeCategory | 'all' | 'popular'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewVariant, setPreviewVariant] = useState<'light' | 'dark'>('light');

  // Filter themes based on category and search
  const filteredThemes = useMemo(() => {
    let themes: Theme[] = [];

    if (activeCategory === 'all') {
      themes = [...PREBUILT_THEMES];
    } else if (activeCategory === 'popular') {
      themes = getPopularThemes();
    } else {
      themes = getThemesByCategory(activeCategory);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const searchResults = searchThemes(searchQuery);
      const searchIds = new Set(searchResults.map((t) => t.theme_id));
      themes = themes.filter((t) => searchIds.has(t.theme_id));
    }

    return themes;
  }, [activeCategory, searchQuery]);

  // Handle theme selection
  const handleSelect = useCallback(
    (theme: Theme) => {
      if (!disabled) {
        onSelect(theme);
      }
    },
    [disabled, onSelect]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Categories list with 'all' and 'popular'
  const categories: Array<{ key: ThemeCategory | 'all' | 'popular'; label: string; icon?: React.ReactNode }> = [
    { key: 'all', label: 'All' },
    { key: 'popular', label: 'Popular', icon: <Star className="w-3.5 h-3.5" /> },
    ...Object.entries(THEME_CATEGORY_INFO).map(([key, info]) => ({
      key: key as ThemeCategory,
      label: info.label,
      icon: CATEGORY_ICONS[key as ThemeCategory],
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Header with search and variant toggle */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search themes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl border border-border/50 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-sm transition-all"
            aria-label="Search themes"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-surface-hover transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 text-text-tertiary" />
            </button>
          )}
        </div>

        {/* Preview variant toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-hover/80 backdrop-blur-sm shadow-sm border border-border/30">
          <button
            type="button"
            onClick={() => setPreviewVariant('light')}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
              ${previewVariant === 'light'
                ? 'bg-white shadow-md text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
              }
            `}
            aria-pressed={previewVariant === 'light'}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Light</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewVariant('dark')}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
              ${previewVariant === 'dark'
                ? 'bg-gray-800 shadow-md text-white'
                : 'text-text-tertiary hover:text-text-secondary'
              }
            `}
            aria-pressed={previewVariant === 'dark'}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Dark</span>
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Theme categories">
        {categories.map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeCategory === key}
            onClick={() => setActiveCategory(key)}
            className={`
              flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
              ${activeCategory === key
                ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                : 'bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-border/30 text-text-secondary hover:bg-surface hover:text-text-primary hover:shadow-sm'
              }
            `}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Theme grid */}
      <div
        className={`
          grid gap-4
          ${compact
            ? 'grid-cols-2 sm:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
          }
        `}
        role="tabpanel"
      >
        {filteredThemes.map((theme) => (
          <ThemeCard
            key={theme.theme_id}
            theme={theme}
            isSelected={selectedThemeId === theme.theme_id}
            previewVariant={previewVariant}
            onSelect={() => handleSelect(theme)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Empty state */}
      {filteredThemes.length === 0 && (
        <div className="glass-card rounded-2xl py-12 text-center">
          <div className="empty-state-icon mx-auto mb-4">
            <Palette className="w-8 h-8" />
          </div>
          <p className="text-text-primary font-semibold">No themes found</p>
          <p className="text-sm text-text-tertiary mt-1">
            {searchQuery
              ? 'Try a different search term'
              : 'No themes available in this category'}
          </p>
          {searchQuery && (
            <AppButton
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="mt-4"
            >
              Clear search
            </AppButton>
          )}
        </div>
      )}

      {/* Selection summary */}
      {selectedThemeId && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="icon-container icon-container-sm icon-container-primary rounded-lg">
              <Check className="w-4 h-4" />
            </div>
            <span className="text-sm text-text-primary">
              <strong>
                {PREBUILT_THEMES.find((t) => t.theme_id === selectedThemeId)?.name}
              </strong>{' '}
              theme selected
            </span>
          </div>
          <span className="text-xs text-text-tertiary bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-full">Changes preview in real-time</span>
        </div>
      )}
    </div>
  );
};

export default ThemeSelector;
